from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict
from typing import Annotated, Literal
from utils import *
from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from dotenv import load_dotenv
from langchain_core.tools import tool
from langgraph.prebuilt import ToolNode
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase
from langchain_core.messages import AIMessage
from prompts import *
from langchain_core.prompts import ChatPromptTemplate
from schemas import *

load_dotenv()


class sql_agent:
    def __init__(self):
        db = SQLDatabase.from_uri("sqlite:///test.db")
        print(db.dialect)
        print(db.get_usable_table_names())
        toolkit = SQLDatabaseToolkit(db=db, llm=initialize_llm())
        tools = toolkit.get_tools()

        list_tables_tool = next(
            tool for tool in tools if tool.name == "sql_db_list_tables"
        )
        get_schema_tool = next(tool for tool in tools if tool.name == "sql_db_schema")

        def db_query_tool(query: str) -> str:
            """
            Execute a SQL query against the database and get back the result.
            If the query is not correct, an error message will be returned.
            If an error is returned, rewrite the query, check the query, and try again.
            """
            result = db.run_no_throw(query)
            print("Executing SQL query...")
            print("query: ", query)
            if not result:
                return "Error: Query failed. Please rewrite your query and try again."
            return result

        class State(TypedDict):
            messages: Annotated[list[AnyMessage], add_messages]

        def first_tool_call(state: State) -> dict[str, list[AIMessage]]:
            print("TEST1")
            return {
                "messages": [
                    AIMessage(
                        content="",
                        tool_calls=[
                            {
                                "name": "sql_db_list_tables",
                                "args": {},
                                "id": "tool_abcd123",
                            }
                        ],
                    )
                ]
            }

        def generate_query(state):
            query_gen_system = QUERY_GEN_SYSTEM
            query_gen_system = (
                query_gen_system
                + "\n Based on the following information about table strucure: "
                + state["messages"][-1].content
                + "generate an sql query using this prompt: "
                + state["messages"][0].content
            )
            print(query_gen_system)
            llm = initialize_llm()
            structured_llm = llm.with_structured_output(json_schema_generate)
            response = structured_llm.invoke(query_gen_system)["query"]
            return {"messages": [("assistant", response)]}

        def should_generate(state) -> Literal["generate_query", "generate_output"]:
            prompt = (
                "Data: "
                + state["messages"][-1].content
                + "\nPrompt:"
                + state["messages"][0].content
            )
            llm = initialize_llm()
            structured_llm = llm.with_structured_output(json_schema_should)
            response = structured_llm.invoke(prompt)["rating"]
            if response.lower() == "yes":
                return "generate_query"
            else:
                return "generate_output"

        def generate_output(state):
            llm = initialize_llm()
            response = llm.invoke(state["messages"][0].content)
            return {"messages": [("assistant", response.content)]}

        def test_query(state) -> Literal["improve_query", "execute_query"]:
            result = db.run_no_throw(state["messages"][-1].content)
            print("Testing SQL query...")
            if not result or "error" in result.lower():
                print("---ERROR---")
                return "improve_query"
            print("---SQL Works---")
            return "execute_query"

        def execute_query(state):
            result = db.run_no_throw(state["messages"][-1].content)
            print("Executing SQL query...")
            print("query: ", state["messages"][-1].content)
            print("result", result)
            return {"messages": [("assistant", result)]}

        def generate_output_query(state):
            prompt = (
                "This sql query "
                + str(state["messages"][-2].content)
                + " returned this sql response: "
                + str(state["messages"][-1].content)
                + ". Based on that data and this question: "
                + state["messages"][0].content
                + "generate a response"
            )
            print("=====")
            print(prompt)
            print("=====")
            llm = initialize_llm()
            response = llm.invoke(prompt)
            print(response)
            return {"messages": [("assistant", response.content)]}

        def improve_query(state):
            result_query = db.run_no_throw(state["messages"][-1].content)
            error_msg = (
                "The query returned no rows. "
                if not result_query
                else "The query generated the following error: " + result_query
            )
            print("error", error_msg)
            query_gen_system = QUERY_GEN_SYSTEM
            query_gen_system = (
                query_gen_system
                + "\n The previous query you generated was incorrect: "
                + state["messages"][-1].content
                + error_msg
                + " fix the error and generate a new sql query using this prompt: "
                + state["messages"][0].content
            )
            llm = initialize_llm()
            structured_llm = llm.with_structured_output(json_schema_generate)
            response = structured_llm.invoke(query_gen_system)
            print("---=====---")
            print(response)
            print("---=====---")
            return {"messages": [("assistant", response["query"])]}

        workflow = StateGraph(State)
        workflow.add_node("first_tool_call", first_tool_call)
        workflow.add_node(
            "list_tables_tool", create_tool_node_with_fallback([list_tables_tool])
        )
        workflow.add_node(
            "get_schema_tool", create_tool_node_with_fallback([get_schema_tool])
        )

        model_get_schema = initialize_llm().bind_tools([get_schema_tool])
        workflow.add_node(
            "model_get_schema",
            lambda state: {
                "messages": [model_get_schema.invoke(state["messages"])],
            },
        )
        workflow.add_node("execute_query", execute_query)
        workflow.add_node("generate_query", generate_query)
        workflow.add_node("generate_output", generate_output)
        workflow.add_node("generate_output_query", generate_output_query)
        workflow.add_node("improve_query", improve_query)

        workflow.add_edge(START, "first_tool_call")
        workflow.add_edge("first_tool_call", "list_tables_tool")
        workflow.add_edge("list_tables_tool", "model_get_schema")
        workflow.add_edge("model_get_schema", "get_schema_tool")
        workflow.add_conditional_edges("get_schema_tool", should_generate)
        workflow.add_conditional_edges("generate_query", test_query)
        workflow.add_conditional_edges("improve_query", test_query)
        workflow.add_edge("execute_query", "generate_output_query")
        workflow.add_edge("generate_output_query", END)
        workflow.add_edge("generate_output", END)
        self.graph = workflow.compile()

    def invoke(self, prompt):
        idk = {"messages": [("user", prompt)]}
        return self.graph.invoke(idk)["messages"][-1].content


if __name__ == "__main__":
    sql = sql_agent()
    idk = {
        "messages": [
            (
                "user",
                "cześć jakie są dni które zamieniły się na not ok a dzien przed tem był ok? użyj danych",
            )
        ]
    }
    print(sql.graph.invoke(idk)["messages"][-1].content)
