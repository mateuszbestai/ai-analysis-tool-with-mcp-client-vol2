import os
import logging
from typing import Any, Literal, List, Dict
import pandas as pd
import re
import uuid

import time

from pandas_settings import (
    CRITICAL_FAILURE_FALLBACK_MESSAGE,
    GRAPHRECURSION_FALLBACK_MESSAGE,
    SYSTEM_PROMPT,
    SYSTEM_PROMPT_DATA,
)

from utils.extra import patch_langchain_openai_toolcall, show_graph
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import AzureChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph, MessagesState
from langgraph.prebuilt import ToolNode
from langgraph.errors import GraphRecursionError
from langchain_core.tools import tool

# Import the MCP client
from mcp_client import MCPClient

load_dotenv()
logger = logging.getLogger("kinaxis-sql-agent")

SYSTEM_PROMPT_SQL = """
You are an SQL expert assistant that converts natural language questions into SQL queries.
Your primary task is to understand the user's question about their data and generate the appropriate SQL query to answer it.

Here are the tables available in the database:
{table_list}

Here are the schemas for the most important tables:
{table_schemas}

RULES:
1. Always write SQL queries that are compatible with Microsoft SQL Server.
2. When writing queries, focus on precision and clarity.
3. For complex questions, break down your reasoning step by step.
4. If you're unsure about a table schema, use the describe_table tool to check the schema before writing a query.
5. Always use proper SQL syntax and follow best practices.
6. NEVER make up tables or columns that are not in the provided schema.
7. If you cannot answer a question with the available schema, explain why.
8. If generating SQL query, use "sql_query" tool. Do not write SQL code inside a regular message.
9. Do not use placeholders for tables or column names - use the actual names from the schema.
10. For visualizations, first get the data with sql_query, then use the create_chart tool to generate a chart.
11. When using the create_chart tool:
    - For the title parameter, provide a descriptive title or an empty string if not needed
    - For the aggregation parameter, specify a valid aggregation function (sum, avg, min, max, count) or an empty string for no aggregation

VISUALIZATION EXAMPLE:
User: "Show me the top 5 products by sales"

First, query the data:
```
sql_query("SELECT TOP 5 ProductName, SUM(Sales) AS TotalSales FROM Sales GROUP BY ProductName ORDER BY TotalSales DESC")
```

Then create a visualization:
```
create_chart(chart_type="bar", x_column="ProductName", y_column="TotalSales", title="Top 5 Products by Sales", aggregation="")
```

"""

class SQLAgent:
    """Agent for handling natural language to SQL queries using Azure OpenAI and MCP Server"""
    
    def __init__(self, server, database, username, password, context_memory=None):
        self.memory = MemorySaver() if context_memory is None else context_memory
        self.server = server
        self.database = database
        self.username = username
        self.password = password
        
        # Initialize MCP client
        self.mcp_client = MCPClient()
        
        # Connect with retry logic
        max_retries = 3
        retry_count = 0
        connection_success = False
        error_message = ""
        
        while retry_count < max_retries and not connection_success:
            success, message = self.mcp_client.connect(server, database, username, password)
            if success:
                connection_success = True
                # Verify token works
                token_valid, _ = self.mcp_client.verify_token()
                if not token_valid:
                    logger.warning("Token created but failed verification, retrying...")
                    retry_count += 1
                    time.sleep(1)
                    continue
                break
            else:
                retry_count += 1
                error_message = message
                if retry_count < max_retries:
                    logger.warning(f"Connection attempt {retry_count} failed: {message}. Retrying in 2 seconds...")
                    time.sleep(2)  # Add a short delay between retries
        
        if not connection_success:
            raise Exception(f"Failed to connect to database after {max_retries} attempts: {error_message}")
        
        # Get tables via MCP with retry logic
        retry_count = 0
        tables_success = False
        
        while retry_count < max_retries and not tables_success:
            self.tables, error = self.mcp_client.get_tables()
            if not error:
                tables_success = True
                break
            else:
                retry_count += 1
                if retry_count < max_retries:
                    logger.warning(f"Failed to get tables (attempt {retry_count}): {error}. Retrying...")
                    # Try to refresh token before retrying
                    refresh_success, _ = self.mcp_client.refresh_token()
                    if not refresh_success:
                        # If refresh fails, try to reconnect
                        self.mcp_client.connect(server, database, username, password)
                    time.sleep(1)
        
        if not tables_success:
            raise Exception(f"Failed to get tables: {error}")
        
        # Initialize schema cache
        self.schemas = {}
        
        # Track important tables (those mentioned in queries)
        self.important_tables = set()
        self.extra_content = None
        self.last_query_result = None
        
        # Create tools first, before setting up the graph
        self.tools = self._create_tools()
        
        # Initialize LLM
        self.model = AzureChatOpenAI(
            deployment_name=os.getenv("AZURE_OPENAI_DEPLOYMENT"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            openai_api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
            temperature=0,
        ).bind_tools(self.tools)
        
        # Setup graph after tools and model are initialized
        self._setup_graph()
    
    def _create_tools(self):
        """Create and return the tools for the agent"""
        @tool
        def sql_query(query: str) -> str:
            """Execute an SQL query against the database and return the results."""
            logger.info(f"Executing SQL query: {query}")
            try:
                # Extract table names from query to track important tables
                table_pattern = r'FROM\s+([^\s,;()]+)|JOIN\s+([^\s,;()]+)'
                tables_found = re.findall(table_pattern, query, re.IGNORECASE)
                for table_match in tables_found:
                    for table in table_match:
                        if table and table in self.tables:
                            self.important_tables.add(table)
                
                result, error = self.mcp_client.execute_query(query)
                if error:
                    return f"Error executing query: {error}"
                
                if isinstance(result, pd.DataFrame):
                    # Save the result for potential visualization
                    self.last_query_result = result
                    
                    if len(result) > 20:
                        return f"Query returned {len(result)} rows. First 20 rows:\n{result.head(20).to_string()}"
                    else:
                        return result.to_string()
                else:
                    return result
            except Exception as e:
                logger.error(f"Error in sql_query tool: {str(e)}")
                return f"Error executing query: {str(e)}"
        
        @tool
        def describe_table(table_name: str) -> str:
            """Get the schema for a specific table."""
            if table_name not in self.tables:
                return f"Table '{table_name}' not found in the database."
            
            # Add to important tables
            self.important_tables.add(table_name)
            
            # Get schema via MCP if not already cached
            if table_name not in self.schemas:
                schema_df, error = self.mcp_client.get_table_schema(table_name)
                if error:
                    return f"Error fetching schema: {error}"
                self.schemas[table_name] = schema_df
            
            schema = self.schemas[table_name]
            
            # Get a sample of the data (first 5 rows)
            try:
                sample_data, error = self.mcp_client.get_table_preview(table_name, 5)
                if error:
                    # Return just the schema if we couldn't get sample data
                    return f"Schema for table {table_name}:\n{schema.to_string()}"
                
                if isinstance(sample_data, pd.DataFrame) and not sample_data.empty:
                    sample_str = sample_data.to_string()
                    return f"Schema for table {table_name}:\n{schema.to_string()}\n\nSample data (first 5 rows):\n{sample_str}"
            except Exception as e:
                logger.error(f"Error getting sample data: {str(e)}")
                # Continue without sample data if there's an error
            
            # Return just the schema if we couldn't get sample data
            return f"Schema for table {table_name}:\n{schema.to_string()}"
        
        @tool
        def create_chart(chart_type: str, x_column: str, y_column: str, title: str, aggregation: str) -> str:
            """
            Create a chart from the last query result.
            
            Parameters:
            - chart_type: Type of chart (bar, line, scatter, pie, histogram)
            - x_column: Column to use for x-axis
            - y_column: Column to use for y-axis (can be comma-separated for multiple series)
            - title: Chart title (set to empty string if not needed)
            - aggregation: Aggregation function to apply (sum, avg, min, max, count, or empty string for no aggregation)
            
            Returns:
            - Message indicating chart was created
            """
            # Import and configure matplotlib to use a non-interactive backend
            import matplotlib
            matplotlib.use('Agg')  # Use the Agg backend which doesn't require a GUI
            import matplotlib.pyplot as plt
            
            logger.info(f"Creating {chart_type} chart with x={x_column}, y={y_column}")
            
            if not hasattr(self, 'last_query_result') or self.last_query_result is None:
                return "No query result available. Run a query first."
            
            df = self.last_query_result
            
            # Check columns exist
            if x_column not in df.columns:
                return f"Column '{x_column}' not found in the query result."
            
            y_columns = [col.strip() for col in y_column.split(',')]
            for col in y_columns:
                if col not in df.columns:
                    return f"Column '{col}' not found in the query result."
            
            # Apply aggregation if specified and not empty
            if aggregation and aggregation.strip():
                valid_aggs = ['sum', 'avg', 'average', 'mean', 'min', 'max', 'count']
                if aggregation.lower() not in valid_aggs:
                    return f"Invalid aggregation function. Choose from: {', '.join(valid_aggs)}"
                
                # Group by x_column and aggregate y_columns
                agg_func = aggregation.lower()
                if agg_func in ['avg', 'average', 'mean']:
                    agg_func = 'mean'
                
                # Create a dictionary of columns to aggregate
                agg_dict = {col: agg_func for col in y_columns}
                df = df.groupby(x_column).agg(agg_dict).reset_index()
            
            # Create the chart
            plt.figure(figsize=(10, 6))
            
            try:
                chart_type = chart_type.lower()
                if chart_type == 'bar':
                    df.set_index(x_column)[y_columns].plot(kind='bar')
                elif chart_type == 'line':
                    df.set_index(x_column)[y_columns].plot(kind='line')
                elif chart_type == 'scatter':
                    # For scatter, we only use the first y column
                    plt.scatter(df[x_column], df[y_columns[0]])
                    plt.xlabel(x_column)
                    plt.ylabel(y_columns[0])
                elif chart_type == 'pie' and len(y_columns) == 1:
                    # For pie charts, we need numeric values and labels
                    df.set_index(x_column)[y_columns[0]].plot(kind='pie', autopct='%1.1f%%')
                elif chart_type == 'histogram' and len(y_columns) == 1:
                    df[y_columns[0]].plot(kind='hist', bins=10)
                    plt.xlabel(y_columns[0])
                else:
                    return f"Unsupported chart type: {chart_type} with the given columns."
                
                # Set title
                if title and title.strip():
                    plt.title(title)
                else:
                    plt.title(f"{chart_type.capitalize()} chart of {', '.join(y_columns)} by {x_column}")
                
                # Generate a unique filename for the chart
                chart_id = str(uuid.uuid4())
                self.extra_content = chart_id
                plt.tight_layout()
                plt.savefig(f"./frontend/dist/assets/{chart_id}.png")
                plt.close()  # Make sure to close the plot to prevent memory leaks
                
                return f"Chart created successfully. The {chart_type} chart shows {', '.join(y_columns)} by {x_column}."
            except Exception as e:
                logger.error(f"Error creating chart: {str(e)}")
                plt.close()  # Make sure to close even if there's an error
                return f"Error creating chart: {str(e)}"
        
        # Return the list of tools
        return [sql_query, describe_table, create_chart]
    
    def _setup_graph(self):
        """Set up the LangGraph workflow for the SQL agent"""
        def add_schema_info(state: MessagesState):
            """Add database schema information to the system prompt"""
            # Create a list of all tables
            table_list = "\n".join([f"- {table}" for table in self.tables])
            
            # Only include schemas for important tables or up to 10 tables if none are marked important
            schema_tables = self.important_tables.copy()
            
            # If we don't have any important tables yet, include a few tables as examples
            if not schema_tables and len(self.tables) > 0:
                schema_tables = set(self.tables[:min(5, len(self.tables))])
            
            # Generate schema text for the selected tables (limited number)
            schema_text = ""
            schema_tables_list = list(schema_tables)[:10]  # Limit to 10 important tables
            
            for table in schema_tables_list:
                if table not in self.schemas:
                    # Lazy load schema if not already loaded
                    schema_df, error = self.mcp_client.get_table_schema(table)
                    if error:
                        schema_text += f"\nError loading schema for table {table}: {error}\n"
                        continue
                    self.schemas[table] = schema_df
                
                schema_df = self.schemas[table]
                schema_text += f"\nTable: {table}\nColumns:\n"
                
                # Only include important columns to reduce context size
                col_sample = schema_df.head(20)  # Limit to first 20 columns
                for _, row in col_sample.iterrows():
                    schema_text += f"- {row['COLUMN_NAME']} ({row['DATA_TYPE']})"
                    if row.get('IS_PRIMARY_KEY') == 'YES':
                        schema_text += " (PK)"
                    if 'FOREIGN_KEY_INFO' in row and row['FOREIGN_KEY_INFO']:
                        schema_text += f" ({row['FOREIGN_KEY_INFO']})"
                    schema_text += "\n"
                
                if len(schema_df) > 20:
                    schema_text += f"- ... {len(schema_df) - 20} more columns (use describe_table for complete schema)\n"
            
            # Add note about additional tables
            if len(self.tables) > len(schema_tables_list):
                schema_text += f"\nThere are {len(self.tables)} tables in total. Use describe_table to see details for other tables.\n"
            
            # For other tables not included in the schema text, add a note
            for table in self.tables:
                if table not in schema_tables_list:
                    schema_text += f"\nTable: {table}\nUse describe_table tool to see the schema.\n"
                    # Only add a few table names to avoid making the prompt too long
                    if len(schema_text.split('\n')) > 100:
                        schema_text += f"\n... and {len(self.tables) - len(schema_tables_list)} more tables.\n"
                        break
            
            prepared_sysprompt = SYSTEM_PROMPT_SQL.format(
                table_list=table_list,
                table_schemas=schema_text
            )
            state["messages"].insert(0, SystemMessage(content=prepared_sysprompt))
        
        def call_model(state: MessagesState):
            """Call the LLM with the current state"""
            messages = state["messages"]
            logger.info("Calling LLM for SQL generation")
            response = self.model.invoke(messages)
            if len(response.content) > 0 and not response.tool_calls:
                logger.info("LLM Response:\n" + (response.content))
            elif not response.tool_calls:
                logger.warning("LLM didn't respond with any content!")
            return {"messages": [response]}
        
        def should_continue(state: MessagesState) -> Literal["tools", END]:
            """Decide whether to execute a tool or end the conversation"""
            messages = state["messages"]
            last_message = messages[-1]
            if last_message.tool_calls:
                logger.info("Last message was a tool call request, moving to tool")
                return "tools"
            logger.info("Last message was a natural response, finishing")
            return END
        
        tool_node = ToolNode(self.tools)
        
        # Define graph
        graph = StateGraph(MessagesState)
        
        # Add nodes
        graph.add_node("schema_info", add_schema_info)
        graph.add_node("agent", call_model)
        graph.add_node("tools", tool_node)
        
        # Add edges
        graph.add_edge(START, "schema_info")
        graph.add_edge("schema_info", "agent")
        graph.add_conditional_edges("agent", should_continue)
        graph.add_edge("tools", "agent")
        
        # Compile graph
        logger.info("Compiling SQL agent graph")
        self.graph = graph.compile(checkpointer=self.memory)
    
    def invoke(self, message, full_context=False):
        """Process a natural language question and return the SQL result"""
        config = {
            "thread_id": "sql_agent",
            "recursion_limit": 50,
        }
        try:
            messages = self.graph.invoke(
                {"messages": [HumanMessage(content=message)]}, config
            )
            if full_context:
                return messages
            return messages["messages"][-1].content
        except GraphRecursionError as e:
            logger.exception(e)
            return "I apologize, but I'm unable to process this request due to complexity limitations. Could you try simplifying your question?"
        except Exception as e:
            logger.exception(e)
            return f"An error occurred: {str(e)}"
    
    # Replace the get_table_preview method in sql_agent.py with this updated version

    def get_table_preview(self, table_name, limit=10):
        """Get a preview of the specified table"""
        logging.info(f"SQLAgent.get_table_preview called for table: {table_name}")
        
        if table_name not in self.tables:
            logging.warning(f"Table '{table_name}' not found in the list of available tables")
            return None, f"Table '{table_name}' not found in the database."
        
        try:
            # Use MCP client to get preview
            logging.info(f"Calling MCP client get_table_preview for {table_name}")
            preview_data, error = self.mcp_client.get_table_preview(table_name, limit)
            
            if error:
                logging.error(f"Error from MCP client: {error}")
                return None, f"Error fetching table preview: {error}"
            
            if preview_data is None:
                logging.warning("No preview data returned from MCP client")
                return None, "No data returned from server"
                
            # Verify DataFrame
            if not isinstance(preview_data, pd.DataFrame):
                logging.error(f"Expected DataFrame but got {type(preview_data).__name__}")
                # Try to convert to DataFrame if possible
                try:
                    if isinstance(preview_data, list):
                        preview_data = pd.DataFrame(preview_data)
                        logging.info(f"Converted list to DataFrame with shape {preview_data.shape}")
                    elif isinstance(preview_data, dict):
                        preview_data = pd.DataFrame.from_dict(preview_data)
                        logging.info(f"Converted dict to DataFrame with shape {preview_data.shape}")
                    else:
                        return None, f"Received unexpected data type: {type(preview_data).__name__}"
                except Exception as conversion_error:
                    logging.error(f"Failed to convert to DataFrame: {str(conversion_error)}")
                    return None, f"Failed to convert data to table format: {str(conversion_error)}"
            
            # Handle empty DataFrames gracefully
            if preview_data.empty:
                logging.info(f"Empty DataFrame returned for table {table_name}")
                # Create a proper empty DataFrame with column information if available
                if preview_data.columns is not None and len(preview_data.columns) > 0:
                    logging.info(f"Empty DataFrame has column information: {list(preview_data.columns)}")
                    # Return the empty DataFrame with columns
                    return preview_data
                else:
                    # Try to get schema information for better column details
                    logging.info(f"Getting schema information for empty table {table_name}")
                    schema_df, schema_error = self.mcp_client.get_table_schema(table_name)
                    if schema_error:
                        logging.warning(f"Could not get schema for empty table: {schema_error}")
                        # Return a basic empty DataFrame with a note
                        return pd.DataFrame(), f"Table {table_name} exists but is empty"
                    
                    # Create empty DataFrame with column names from schema
                    if schema_df is not None and not schema_df.empty:
                        column_names = schema_df["COLUMN_NAME"].tolist()
                        logging.info(f"Created empty DataFrame with columns from schema: {column_names}")
                        return pd.DataFrame(columns=column_names)
                    else:
                        return pd.DataFrame(), f"Table {table_name} exists but is empty"
            
            logging.info(f"Successfully retrieved preview with {len(preview_data)} rows and {len(preview_data.columns)} columns")
            return preview_data
            
        except Exception as e:
            logging.error(f"Exception in get_table_preview: {str(e)}", exc_info=True)
            return None, f"Exception while fetching preview: {str(e)}"