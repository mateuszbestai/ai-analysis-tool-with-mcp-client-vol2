# mcp_client.py - Client adapter for MCP server
import os
import requests
import json
import pandas as pd
import logging
from dotenv import load_dotenv
from urllib.parse import urljoin

load_dotenv()

logger = logging.getLogger("mcp-client")

class MCPClient:
    """Client for interacting with the MCP server"""
    
    def __init__(self, base_url=None):
        """Initialize the MCP client with the server base URL"""
        self.base_url = base_url or os.getenv("MCP_SERVER_URL", "http://localhost:3000")
        self.token = None
        self.connection_id = None
    
    def connect(self, server, database, username, password):
        """Connect to a database through the MCP server"""
        url = urljoin(self.base_url, "/api/connect")
        
        try:
            response = requests.post(
                url,
                json={
                    "server": server,
                    "database": database,
                    "username": username,
                    "password": password
                }
            )
            
            if response.status_code != 200:
                error_msg = response.json().get("error", "Unknown error")
                logger.error(f"Connection error: {error_msg}")
                return False, error_msg
            
            data = response.json()
            self.token = data.get("token")
            self.connection_id = data.get("connectionId")
            
            return True, "Connected successfully"
        except Exception as e:
            logger.error(f"Error connecting to MCP server: {str(e)}")
            return False, f"Error connecting to MCP server: {str(e)}"
        
    def verify_token(self):
        """Verify if the current token is valid and reconnect if needed"""
        if not self.token:
            return False, "No token available"

        try:
            # Try to get tables as a lightweight validation method
            url = urljoin(self.base_url, "/api/tables")
            
            response = requests.get(
                url,
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            # If unauthorized or forbidden, try to reconnect
            if response.status_code in [401, 403]:
                logger.warning(f"Token validation failed with status {response.status_code}, attempting to reconnect")
                
                # Try to reconnect if we have connection info
                if hasattr(self, '_connection_info') and self._connection_info:
                    return self.connect(
                        self._connection_info.get('server'),
                        self._connection_info.get('database'),
                        self._connection_info.get('username'),
                        self._connection_info.get('password')
                    )
                else:
                    return False, "Token invalid and no connection info available for reconnection"
            
            # For all other status codes
            if response.status_code != 200:
                return False, f"Token validation failed with status {response.status_code}"
                
            # If we got here, token is valid
            return True, "Token is valid"
            
        except Exception as e:
            logger.error(f"Error verifying token: {str(e)}")
            return False, f"Error verifying token: {str(e)}"
    
    def validate_token(self, token):
        """Validate a token and return connection information"""
        if not token:
            return None, "No token provided"
        
        try:
            # Set the token
            self.token = token
            
            # Try to get tables as a validation test
            tables, error = self.get_tables()
            
            if error:
                return None, error
            
            # Return connection info (we can't get credentials back, but we have evidence of a valid connection)
            return {
                "valid": True,
                "tables": tables,
                "server": "server info not available",  # For security, we don't retrieve the actual credentials
                "database": "database info not available"
            }, None
        except Exception as e:
            logging.error(f"Error validating token: {str(e)}")
            return None, f"Error validating token: {str(e)}"
        
    def extract_dataframe(self, data):
        """Extract a DataFrame from various response formats"""
        if not data or not isinstance(data, dict):
            logger.error("Invalid data format - not a dictionary")
            return None
        
        # Debug log the data structure
        logger.debug(f"Extracting DataFrame from data with keys: {list(data.keys())}")
        
        # Case 1: Direct format with rows and headers at top level
        if "rows" in data and "headers" in data:
            rows = data["rows"]
            headers = data["headers"]
            
            if isinstance(rows, list) and isinstance(headers, list):
                # Even if rows is empty, we can still create a DataFrame with the headers
                logger.info(f"Creating DataFrame from direct rows ({len(rows)} rows) and headers ({len(headers)} columns)")
                return pd.DataFrame(rows, columns=headers)
        
        # Case 2: Nested format with table containing rows and headers
        if "table" in data and isinstance(data["table"], dict):
            table_data = data["table"]
            if "rows" in table_data and "headers" in table_data:
                rows = table_data["rows"]
                headers = table_data["headers"]
                
                if isinstance(rows, list) and isinstance(headers, list):
                    logger.info(f"Creating DataFrame from nested table data ({len(rows)} rows)")
                    return pd.DataFrame(rows, columns=headers)
        
        # Other cases from previous implementation...
        # (Keep your existing extraction patterns here)
        
        # If we couldn't extract a DataFrame through specific patterns, log and return None
        available_keys = list(data.keys())
        logger.error(f"Could not extract DataFrame from response. Available keys: {available_keys}")
        return None

    
    def get_tables(self):
        """Get all tables from the connected database"""
        if not self.token:
            return None, "Not connected to any database"
        
        url = urljoin(self.base_url, "/api/tables")
        
        try:
            response = requests.get(
                url,
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            if response.status_code != 200:
                error_msg = response.json().get("error", "Unknown error")
                logger.error(f"Error fetching tables: {error_msg}")
                return None, error_msg
            
            return response.json().get("tables", []), None
        except Exception as e:
            logger.error(f"Error fetching tables: {str(e)}")
            return None, f"Error fetching tables: {str(e)}"
    
    def get_table_schema(self, table_name):
        """Get schema for a specific table"""
        if not self.token:
            return None, "Not connected to any database"
        
        url = urljoin(self.base_url, f"/api/schema/{table_name}")
        
        try:
            response = requests.get(
                url,
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            if response.status_code != 200:
                error_msg = response.json().get("error", "Unknown error")
                logger.error(f"Error fetching schema: {error_msg}")
                return None, error_msg
            
            schema_data = response.json().get("schema", [])
            
            # Convert to pandas DataFrame for compatibility with existing code
            if schema_data:
                schema_df = pd.DataFrame(schema_data)
                return schema_df, None
            
            return pd.DataFrame(), None
        except Exception as e:
            logger.error(f"Error fetching schema: {str(e)}")
            return None, f"Error fetching schema: {str(e)}"
    
    def execute_query(self, query):
        """Execute an SQL query"""
        if not self.token:
            return None, "Not connected to any database"
        
        url = urljoin(self.base_url, "/api/query")
        
        try:
            response = requests.post(
                url,
                json={"query": query},
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            if response.status_code != 200:
                error_msg = response.json().get("error", "Unknown error")
                logger.error(f"Error executing query: {error_msg}")
                return error_msg, None
            
            data = response.json()
            
            # Convert to pandas DataFrame for compatibility with existing code
            if data.get("rows"):
                df = pd.DataFrame(data.get("rows"))
                return df, None
            elif data.get("rowCount") is not None:
                return f"Query executed successfully. Affected rows: {data.get('rowCount')}", None
            
            return "Query executed successfully", None
        except Exception as e:
            logger.error(f"Error executing query: {str(e)}")
            return f"Error executing query: {str(e)}", None
    
    # Replace the get_table_preview method in mcp_client.py with this updated version

    # Enhanced token handling and reconnection functions for mcp_client.py

    def get_table_preview(self, table_name, limit=10):
        """Get a preview of the specified table with enhanced debugging and error handling"""
        # First verify token is valid
        token_valid, message = self.verify_token()
        if not token_valid:
            logger.warning(f"Token verification failed: {message}")
            if not self.token and hasattr(self, '_connection_info') and self._connection_info:
                # Try to reconnect
                logger.info("Attempting to reconnect")
                success, msg = self.connect(
                    self._connection_info.get('server'),
                    self._connection_info.get('database'),
                    self._connection_info.get('username'),
                    self._connection_info.get('password')
                )
                if not success:
                    return None, f"Not connected to any database: {msg}"
            elif not self.token:
                return None, "Not connected to any database"
        
        url = urljoin(self.base_url, f"/api/preview/{table_name}")
        
        try:
            # Log the request details for debugging
            logger.info(f"Requesting preview for table {table_name} with token {self.token[:10] if self.token else 'None'}...")
            
            # Make the request
            response = requests.get(
                url,
                headers={"Authorization": f"Bearer {self.token}"},
                params={"limit": limit}
            )
            
            # Log the response status and content preview
            logger.info(f"Preview response status: {response.status_code}")
            logger.info(f"Response content sample: {response.text[:200]}...")
            
            # Handle authentication errors with reconnection attempt
            if response.status_code == 401 or response.status_code == 403:
                logger.warning("Authentication failed, token may have expired")
                
                # Try to reconnect if we have connection info
                if hasattr(self, '_connection_info') and self._connection_info:
                    logger.info("Attempting reconnection")
                    success, message = self.connect(
                        self._connection_info.get('server'),
                        self._connection_info.get('database'),
                        self._connection_info.get('username'),
                        self._connection_info.get('password')
                    )
                    if success:
                        logger.info("Reconnection successful, retrying preview request")
                        # Retry the request with new token
                        return self.get_table_preview(table_name, limit)
                    else:
                        self.token = None
                        logger.error(f"Reconnection failed: {message}")
                        return None, f"Authentication failed and reconnection attempt failed: {message}"
                else:
                    self.token = None
                    return None, "Authentication failed. Please reconnect to the database."
            
            if response.status_code != 200:
                # Try to get detailed error message
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", "Unknown error")
                except:
                    error_msg = f"HTTP error {response.status_code}"
                
                logger.error(f"Error fetching preview: {error_msg}")
                return None, error_msg
            
            # Process response
            try:
                data = response.json()
                
                # Log the response structure
                logger.info(f"Preview response structure: {list(data.keys())}")
                
                # Extract DataFrame from the response data
                df = None
                
                # Case 1: Direct format with rows and headers at top level
                if "rows" in data and "headers" in data:
                    rows = data["rows"]
                    headers = data["headers"]
                    
                    if isinstance(rows, list) and isinstance(headers, list):
                        logger.info(f"Creating DataFrame from direct rows ({len(rows)} rows) and headers ({len(headers)} columns)")
                        df = pd.DataFrame(rows, columns=headers)
                
                # Case 2: Nested format with table containing rows and headers
                elif "table" in data and isinstance(data["table"], dict):
                    table_data = data["table"]
                    if "rows" in table_data and "headers" in table_data:
                        rows = table_data["rows"]
                        headers = table_data["headers"]
                        
                        if isinstance(rows, list) and isinstance(headers, list):
                            logger.info(f"Creating DataFrame from nested table data ({len(rows)} rows)")
                            df = pd.DataFrame(rows, columns=headers)
                
                # Case 3: Response contains recordset with objects
                elif "recordset" in data and isinstance(data["recordset"], list) and len(data["recordset"]) > 0:
                    logger.info(f"Creating DataFrame from recordset ({len(data['recordset'])} rows)")
                    df = pd.DataFrame(data["recordset"])
                
                if df is not None:
                    # Add the original data structure to the DataFrame as an attribute
                    # This helps downstream functions that need the original format
                    df.raw_data = data
                    
                    # Create a formatted structure that's consistent
                    formatted_data = {
                        "headers": df.columns.tolist(),
                        "rows": df.values.tolist()
                    }
                    
                    # Store the formatted data on the DataFrame
                    df.formatted_data = formatted_data
                    
                    logger.info(f"Successfully created DataFrame with shape {df.shape}")
                    return df, None
                
                # Fallback: try to create a DataFrame from the entire response
                logger.warning("Could not extract DataFrame with standard methods, attempting direct conversion")
                try:
                    df = pd.DataFrame(data)
                    df.raw_data = data
                    logger.info(f"Created DataFrame directly from response: {df.shape}")
                    return df, None
                except Exception as direct_error:
                    logger.error(f"Direct conversion failed: {str(direct_error)}")
                
                # If we couldn't extract a DataFrame, provide detailed error
                error_msg = "Could not convert response to DataFrame"
                logger.error(error_msg)
                
                # Log detailed information about the response structure
                if len(data) > 0:
                    for key, value in data.items():
                        logger.error(f"Key '{key}' has value of type '{type(value).__name__}'")
                        if isinstance(value, (dict, list)) and value:
                            sample = str(value)[:100] + "..." if len(str(value)) > 100 else str(value)
                            logger.error(f"Sample of '{key}': {sample}")
                
                # Return the original data anyway as a last resort
                logger.info("Returning original data as a last resort")
                return data, None
                
            except Exception as parse_error:
                logger.error(f"Error parsing response: {str(parse_error)}")
                # Log response content for debugging
                try:
                    logger.error(f"Response content: {response.text[:500]}...")  # Log first 500 chars
                except:
                    logger.error("Could not log response content")
                return None, f"Error parsing response: {str(parse_error)}"
                
        except Exception as e:
            logger.error(f"Error fetching preview: {str(e)}")
            return None, f"Error fetching preview: {str(e)}"

    def connect(self, server, database, username, password):
        """Connect to a database through the MCP server with connection info caching"""
        url = urljoin(self.base_url, "/api/connect")
        
        # Store connection info for potential reconnection
        self._connection_info = {
            'server': server,
            'database': database,
            'username': username,
            'password': password
        }
        
        try:
            response = requests.post(
                url,
                json={
                    "server": server,
                    "database": database,
                    "username": username,
                    "password": password
                }
            )
            
            if response.status_code != 200:
                error_msg = response.json().get("error", "Unknown error")
                logger.error(f"Connection error: {error_msg}")
                return False, error_msg
            
            data = response.json()
            self.token = data.get("token")
            self.connection_id = data.get("connectionId")
            
            return True, "Connected successfully"
        except Exception as e:
            logger.error(f"Error connecting to MCP server: {str(e)}")
            return False, f"Error connecting to MCP server: {str(e)}"
    
    def analyze_question(self, question):
        """Send a natural language question to the MCP server for analysis"""
        if not self.token:
            return None, "Not connected to any database"
        
        url = urljoin(self.base_url, "/api/analyze")
        
        try:
            response = requests.post(
                url,
                json={"question": question},
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            if response.status_code != 200:
                error_msg = response.json().get("error", "Unknown error")
                logger.error(f"Error analyzing question: {error_msg}")
                return None, error_msg
            
            return response.json(), None
        except Exception as e:
            logger.error(f"Error analyzing question: {str(e)}")
            return None, f"Error analyzing question: {str(e)}"
    
    def refresh_tables(self):
        """Refresh the cached tables list"""
        if not self.token:
            return None, "Not connected to any database"
        
        url = urljoin(self.base_url, "/api/refresh-tables")
        
        try:
            response = requests.post(
                url,
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            if response.status_code != 200:
                error_msg = response.json().get("error", "Unknown error")
                logger.error(f"Error refreshing tables: {error_msg}")
                return None, error_msg
            
            return response.json().get("tables", []), None
        except Exception as e:
            logger.error(f"Error refreshing tables: {str(e)}")
            return None, f"Error refreshing tables: {str(e)}"
    
    def refresh_token(self):
        """Attempt to refresh the authentication token"""
        if not self.token:
            return False, "No token to refresh"
        
        url = urljoin(self.base_url, "/api/refresh-token")
        
        try:
            response = requests.post(
                url,
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            if response.status_code != 200:
                error_msg = response.json().get("error", "Unknown error")
                logger.error(f"Token refresh error: {error_msg}")
                return False, error_msg
            
            data = response.json()
            self.token = data.get("token")
            self.connection_id = data.get("connectionId")
            
            logger.info("Token refreshed successfully")
            return True, "Token refreshed successfully"
        except Exception as e:
            logger.error(f"Error refreshing token: {str(e)}")
            return False, f"Error refreshing token: {str(e)}"
    
    def disconnect(self):
        """Disconnect from the database"""
        if not self.token:
            return True, "Not connected to any database"
        
        url = urljoin(self.base_url, "/api/disconnect")
        
        try:
            response = requests.post(
                url,
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            # Reset client state regardless of response
            self.token = None
            self.connection_id = None
            
            if response.status_code != 200:
                error_msg = response.json().get("error", "Unknown error")
                logger.warning(f"Error during disconnect: {error_msg}")
                return False, error_msg
            
            return True, "Disconnected successfully"
        except Exception as e:
            logger.error(f"Error disconnecting: {str(e)}")
            # Reset token and connection ID even if there was an error
            self.token = None
            self.connection_id = None
            return False, f"Error disconnecting: {str(e)}"