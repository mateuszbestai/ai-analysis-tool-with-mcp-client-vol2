# app.py
from collections import defaultdict
import os
import uuid
from flask import Flask, request, jsonify, render_template, session, send_from_directory
from flask_session import Session
import pandas as pd
from dotenv import load_dotenv
import pandas_agent
from sql_agent import SQLAgent  # Import the modified SQLAgent that uses MCP client
from utils.xml_parser import xml_str_to_df
from langgraph.checkpoint.memory import MemorySaver
from werkzeug.utils import secure_filename
import logging

UPLOAD_FOLDER = "uploads"

load_dotenv()
app = Flask(__name__, template_folder="frontend/dist")
app.secret_key = os.getenv("APP_SECRET_KEY")
# Configure upload folder and allowed extensions
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["SESSION_TYPE"] = "filesystem"
app.config["MAX_CONTENT_LENGTH"] = 16 * 1000 * 1000
Session(app)

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

ALLOWED_EXTENSIONS = {".csv", ".xml"}

def get_extension(filename: str):
    _, extension = os.path.splitext(filename)
    return extension.lower()

def allowed_file(filename: str):
    return "." in filename and get_extension(filename) in ALLOWED_EXTENSIONS

def defaultdictoverride():
    return defaultdict(dict)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/assets/<filename>")
def serve_image(filename):
    return send_from_directory("frontend/dist/assets", filename)

@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type"}), 400

    try:
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(file_path)  # Save file to disk
        session["csv_filepath"] = file_path  # Save file path in session

        file_ext = get_extension(file.filename)
        if file_ext == ".csv":
            session["dataframe"] = pd.read_csv(file_path)
        elif file_ext == ".xml":
            session["dataframe"] = xml_str_to_df(file.stream.read())

        agent_context = MemorySaver()
        agent_context.storage.default_factory = defaultdictoverride
        session["agent_context"] = agent_context
        session["mode"] = "csv"  # Set mode to CSV

        return jsonify({"message": "File uploaded successfully"}), 200
    except Exception as e:
        logging.error("Error during file upload: %s", str(e))
        return jsonify({"error": "Failed to upload file"}), 500

@app.route("/connect_db", methods=["POST"])
def connect_database():
    data = request.get_json()
    server = data.get("server")
    database = data.get("database")
    username = data.get("username")
    password = data.get("password")
    
    if not all([server, database, username, password]):
        return jsonify({"error": "All database connection parameters are required"}), 400
    
    try:
        # Create SQL agent with MCP client
        agent_context = MemorySaver()
        agent_context.storage.default_factory = defaultdictoverride
        sql_agent = SQLAgent(server, database, username, password, agent_context)
        
        # Store SQL agent connection info in session
        session["sql_server"] = server
        session["sql_database"] = database
        session["sql_username"] = username
        session["sql_password"] = password
        session["agent_context"] = agent_context
        session["mode"] = "sql"  # Explicitly set mode to SQL
        
        # Force session to save
        session.modified = True
        
        # Get table list for confirmation
        tables = sql_agent.tables
        
        # Get token from MCP client if available
        token = None
        if hasattr(sql_agent, 'mcp_client') and hasattr(sql_agent.mcp_client, 'token'):
            token = sql_agent.mcp_client.token
        
        return jsonify({
            "message": "Database connected successfully",
            "tables": tables,
            "token": token
        }), 200
    except Exception as e:
        logging.error("Error connecting to database: %s", str(e))
        return jsonify({"error": f"Failed to connect to database: {str(e)}"}), 500

# Replace the get_table_preview route in app.py with this updated version

@app.route("/get_table_preview", methods=["POST"])
def get_table_preview():
    """Get a preview of a table with simplified processing"""
    data = request.get_json()
    table_name = data.get("table")
    
    if not table_name:
        return jsonify({"error": "Table name is required"}), 400
    
    # Log request details
    logging.info(f"Received preview request for table: {table_name}")
    logging.info(f"Session mode: {session.get('mode')}")
    
    # First check if we have a database connection
    if session.get("mode") != "sql" or not all([
        session.get("sql_server"),
        session.get("sql_database"),
        session.get("sql_username"),
        session.get("sql_password")
    ]):
        return jsonify({"error": "No database connection active"}), 400
    
    try:
        # Get token from request headers if available
        auth_header = request.headers.get('Authorization')
        token = None
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            logging.info(f"Token received in request: {token[:10]}...")
        
        # Create agent context if needed
        agent_context = session.get("agent_context")
        if agent_context is None:
            agent_context = MemorySaver()
            agent_context.storage.default_factory = defaultdictoverride
            session["agent_context"] = agent_context
        
        # Create SQL agent
        logging.info("Creating SQLAgent for table preview")
        sql_agent = SQLAgent(
            session.get("sql_server"),
            session.get("sql_database"),
            session.get("sql_username"),
            session.get("sql_password"),
            agent_context
        )
        
        # If we received a token in the request, make sure the MCP client uses it
        if token and hasattr(sql_agent, 'mcp_client'):
            sql_agent.mcp_client.token = token
            logging.info("Updated MCP client with token from request")
        
        # Execute a simple query to get table preview
        try:
            logging.info(f"Executing direct SQL query for table preview: {table_name}")
            query = f"SELECT TOP 10 * FROM [{table_name}]"
            result, error = sql_agent.mcp_client.execute_query(query)
            
            if error:
                logging.error(f"Error executing preview query: {error}")
                return jsonify({"error": f"Error executing preview query: {error}"}), 500
                
            if not isinstance(result, pd.DataFrame):
                logging.error(f"Query result is not a DataFrame: {type(result)}")
                return jsonify({"error": "Query result is not in expected format"}), 500
                
            # Convert DataFrame to list format for response
            headers = result.columns.tolist()
            
            # Handle each row and convert values to JSON-serializable format
            rows = []
            for _, row in result.iterrows():
                row_data = []
                for item in row:
                    if pd.isna(item):
                        row_data.append(None)
                    elif isinstance(item, (int, float, bool)):
                        row_data.append(item)
                    else:
                        row_data.append(str(item))
                rows.append(row_data)
            
            logging.info(f"Preview successful: {len(rows)} rows, {len(headers)} columns")
            
            # Return in the expected format
            return jsonify({
                "message": f"Preview of {table_name}",
                "table": {
                    "headers": headers,
                    "rows": rows
                }
            }), 200
            
        except Exception as query_error:
            logging.error(f"Error executing preview query: {str(query_error)}")
            return jsonify({"error": f"Error executing preview query: {str(query_error)}"}), 500
            
    except Exception as e:
        logging.error("Error getting table preview: %s", str(e), exc_info=True)
        return jsonify({"error": f"Failed to get table preview: {str(e)}"}), 500

@app.route("/check_connection_status", methods=["GET"])
def check_connection_status():
    """Check if there's an active database connection"""
    # Check if we have the essential connection parameters
    if all([
        session.get("sql_server"),
        session.get("sql_database"),
        session.get("sql_username"),
        session.get("sql_password")
    ]):
        try:
            # Update the mode to ensure it's set correctly
            session["mode"] = "sql"
            
            # Create agent context if needed
            agent_context = session.get("agent_context")
            if agent_context is None:
                agent_context = MemorySaver()
                agent_context.storage.default_factory = defaultdictoverride
                session["agent_context"] = agent_context
            
            # Create SQL agent to verify connection
            logging.info("Creating SQL agent to verify connection")
            sql_agent = SQLAgent(
                session.get("sql_server"),
                session.get("sql_database"),
                session.get("sql_username"),
                session.get("sql_password"),
                agent_context
            )
            
            # Store the MCP client token in a cookie for later use
            if hasattr(sql_agent, 'mcp_client') and sql_agent.mcp_client.token:
                logging.info("Storing MCP token in cookie")
                response = jsonify({
                    "connected": True,
                    "database": session.get("sql_database"),
                    "tables": sql_agent.tables
                })
                response.set_cookie(
                    "mcp_token", 
                    sql_agent.mcp_client.token,
                    httponly=True,
                    secure=True,
                    samesite='Strict',
                    max_age=28800  # 8 hours
                )
                return response, 200
            
            return jsonify({
                "connected": True,
                "database": session.get("sql_database"),
                "tables": sql_agent.tables
            }), 200
        except Exception as e:
            logging.error(f"Error checking connection status: {str(e)}")
            # Clear the session data if connection verification fails
            session.pop("sql_server", None)
            session.pop("sql_database", None)
            session.pop("sql_username", None)
            session.pop("sql_password", None)
            session["mode"] = "csv"
            
            return jsonify({
                "connected": False,
                "error": str(e)
            }), 200
    else:
        # Try to recover connection details from MCP token if present
        auth_header = request.headers.get('Authorization')
        mcp_token_cookie = request.cookies.get('mcp_token')
        token = None
        
        # Check both Authorization header and cookie
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            logging.info("Found token in Authorization header")
        elif mcp_token_cookie:
            token = mcp_token_cookie
            logging.info("Found token in cookie")
            
        if token:
            try:
                # Create a temporary MCP client to validate the token
                from mcp_client import MCPClient
                temp_client = MCPClient()
                temp_client.token = token  # Set token first
                
                # Try to fetch tables as a validation method
                tables, error = temp_client.get_tables()
                
                if not error and tables:
                    logging.info(f"Successfully validated token and retrieved {len(tables)} tables")
                    # Get more info about the connection if possible
                    connection_info = {}
                    try:
                        # Try the new validate-token endpoint if it exists
                        validate_response = requests.post(
                            urljoin(temp_client.base_url, "/api/validate-token"),
                            headers={"Authorization": f"Bearer {token}"}
                        )
                        if validate_response.status_code == 200:
                            connection_info = validate_response.json()
                    except Exception as validate_error:
                        logging.warning(f"Token validation endpoint not available: {str(validate_error)}")
                    
                    # Restore session mode
                    session["mode"] = "sql"
                    
                    # Create agent context if not exists
                    if not session.get("agent_context"):
                        agent_context = MemorySaver()
                        agent_context.storage.default_factory = defaultdictoverride
                        session["agent_context"] = agent_context
                    
                    # Store token in a cookie for future requests
                    response = jsonify({
                        "connected": True,
                        "database": connection_info.get("database", "Connected Database"),
                        "tables": tables
                    })
                    response.set_cookie(
                        "mcp_token", 
                        token,
                        httponly=True,
                        secure=True,
                        samesite='Strict',
                        max_age=28800  # 8 hours
                    )
                    return response, 200
                else:
                    logging.error(f"Token validation failed: {error}")
            except Exception as token_error:
                logging.error(f"Error recovering connection from token: {str(token_error)}")
                
        return jsonify({
            "connected": False
        }), 200
    
@app.route("/refresh_tables", methods=["POST"])
def refresh_tables():
    """Refresh the list of tables from the database"""
    if session.get("mode") != "sql":
        return jsonify({"error": "No database connection active"}), 400
    
    try:
        # Create SQL agent to get fresh tables
        sql_agent = SQLAgent(
            session.get("sql_server"),
            session.get("sql_database"),
            session.get("sql_username"),
            session.get("sql_password"),
            session.get("agent_context")
        )
        
        # SQLAgent's MCP client already handles table refreshing
        return jsonify({
            "message": "Tables refreshed successfully",
            "tables": sql_agent.tables
        }), 200
    except Exception as e:
        logging.error(f"Error refreshing tables: {str(e)}")
        return jsonify({"error": f"Failed to refresh tables: {str(e)}"}), 500

@app.route("/clear", methods=["POST"])
def clear_chatlog():
    if session.get("agent_context"):
        agent_context = MemorySaver()
        agent_context.storage.default_factory = defaultdictoverride
        session["agent_context"] = agent_context
        return "cleared", 200
    else:
        return "no agent session, nothing to clear", 200

@app.route("/ask", methods=["POST"])
def ask_question():
    data = request.get_json()
    question = data.get("question", "").strip()
    
    if not question:
        return jsonify({"answer": "Please provide a valid question."}), 400
    
    # Check if we're in SQL or CSV mode
    mode = session.get("mode", "csv")
    
    if mode == "csv":
        return handle_csv_question(question)
    elif mode == "sql":
        return handle_sql_question(question)
    else:
        return jsonify({"error": "Invalid mode. Please upload a file or connect to a database."}), 400

def handle_csv_question(question):
    """Handle questions in CSV mode with support for last/bottom rows"""
    # Retrieve DataFrame from the session
    csv_filepath = session.get("csv_filepath")
    if not csv_filepath:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pd.read_csv(csv_filepath)
        logging.info(f"Successfully read CSV with {len(df)} rows and {len(df.columns)} columns")
    except Exception as e:
        logging.error("Error reading CSV file: %s", str(e))
        return jsonify({"error": "Failed to process the uploaded file"}), 500

    # Handle table-related questions
    if any(term in question.lower() for term in ["table", "rows", "data", "show", "display"]):
        # Check if the user wants the last rows instead of the first rows
        want_last_rows = any(term in question.lower() for term in ["last", "bottom", "tail", "end"])
        
        # Extract the number of rows requested
        import re
        match = re.search(r"(\d+)\s*rows", question.lower())
        num_rows = int(match.group(1)) if match else 10  # Default to 10 rows
        
        # Limit rows to the maximum available rows in the DataFrame
        num_rows = min(num_rows, len(df))
        
        # Get either head or tail based on what was requested
        if want_last_rows:
            df_subset = df.tail(num_rows)
            description = f"last {num_rows}"
        else:
            df_subset = df.head(num_rows)
            description = f"first {num_rows}"
        
        # Convert DataFrame to lists for JSON serialization
        data_rows = []
        for _, row in df_subset.iterrows():
            row_data = []
            for item in row:
                if pd.isna(item):
                    row_data.append(None)
                elif isinstance(item, (int, float, bool)):
                    row_data.append(item)
                else:
                    row_data.append(str(item))
            data_rows.append(row_data)
        
        # Ensure column names are strings
        headers = [str(col) for col in df.columns.tolist()]
        
        # Log what we're sending
        logging.info(f"Sending {description} rows as table with {len(headers)} columns and {len(data_rows)} rows")
        
        # Prepare table data
        table_data = {
            "headers": headers,
            "rows": data_rows
        }
        
        return jsonify({
            "answer": f"Here are the {description} rows of the data:",
            "table": table_data
        })

    # General question handling (fallback to agent)
    try:
        agent_context = session.get("agent_context")
        if agent_context is None:
            agent_context = MemorySaver()
            agent_context.storage.default_factory = defaultdictoverride

        agent = pandas_agent.PandasAgent(df, agent_context)
        answer = agent.invoke(question)
        session["agent_context"] = agent_context  # Save updated context
        return jsonify({"answer": answer, "image": agent.extra_content, "table": None})
    except Exception as e:
        logging.error("Error in /ask endpoint: %s", str(e))
        return jsonify({"error": "Failed to process the question."}), 500

def handle_sql_question(question):
    """Handle questions in SQL mode with improved table data handling"""
    # Check if we have database connection info
    if not all([
        session.get("sql_server"),
        session.get("sql_database"),
        session.get("sql_username"),
        session.get("sql_password")
    ]):
        return jsonify({"error": "Database connection information is missing"}), 400
    
    # Check for data/table related questions
    is_data_request = any(term in question.lower() for term in ["show", "display", "table", "rows", "data"])
    
    try:
        agent_context = session.get("agent_context")
        if agent_context is None:
            agent_context = MemorySaver()
            agent_context.storage.default_factory = defaultdictoverride
        
        # Create SQL agent with MCP client
        sql_agent = SQLAgent(
            session.get("sql_server"),
            session.get("sql_database"),
            session.get("sql_username"),
            session.get("sql_password"),
            agent_context
        )
        
        # Process the question
        answer = sql_agent.invoke(question)
        session["agent_context"] = agent_context  # Save updated context
        
        # Check if a chart was generated
        if sql_agent.extra_content:
            return jsonify({
                "answer": answer,
                "image": sql_agent.extra_content,
                "table": None
            })
        
        # Direct handling for table/data requests
        if is_data_request and hasattr(sql_agent, 'last_query_result') and sql_agent.last_query_result is not None:
            df = sql_agent.last_query_result
            
            # Convert DataFrame to table format
            if isinstance(df, pd.DataFrame) and not df.empty:
                rows = []
                for _, row in df.iterrows():
                    row_data = []
                    for item in row:
                        if pd.isna(item):
                            row_data.append(None)
                        elif isinstance(item, (int, float, bool)):
                            row_data.append(item)
                        else:
                            row_data.append(str(item))
                    rows.append(row_data)
                
                table_data = {
                    "headers": df.columns.tolist(),
                    "rows": rows
                }
                
                logging.info(f"Returning table data with {len(rows)} rows and {len(df.columns)} columns")
                
                return jsonify({
                    "answer": "Here are the results:",
                    "table": table_data
                })
        
        # Check if the answer contains a table-like structure
        if isinstance(answer, str) and answer.count("\n") > 2 and "|" in answer:
            # Potential table output, try to parse it
            try:
                # Simple parsing logic for table format
                lines = answer.strip().split("\n")
                if len(lines) > 2:
                    headers = [h.strip() for h in lines[0].split("|") if h.strip()]
                    rows = []
                    for line in lines[2:]:
                        if "|" in line and not line.strip().startswith("+"):
                            row = [cell.strip() for cell in line.split("|") if cell.strip()]
                            if row:
                                rows.append(row)
                    
                    if headers and rows:
                        logging.info(f"Extracted table data with {len(rows)} rows and {len(headers)} columns")
                        return jsonify({
                            "answer": "Here are the results:",
                            "table": {
                                "headers": headers,
                                "rows": rows
                            }
                        })
            except Exception as parsing_error:
                logging.error(f"Error parsing table-like output: {str(parsing_error)}")
        
        # Return plain text answer if no table structure detected
        return jsonify({"answer": answer, "image": None, "table": None})
    except Exception as e:
        logging.error("Error in SQL question handling: %s", str(e))
        return jsonify({"error": f"Failed to process the SQL question: {str(e)}"}), 500

@app.route("/forecast", methods=["POST"])
def forecast():
    data = request.get_json()
    date_column = data.get("date_column")
    value_column = data.get("value_column")

    try:
        periods = int(data.get("periods", 10))
        if periods <= 0:
            raise ValueError("Periods must be a positive integer.")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    csv_filepath = session.get("csv_filepath")
    if not csv_filepath:
        return jsonify({"error": "No CSV file uploaded"}), 400

    try:
        csv_data = pd.read_csv(csv_filepath)
        agent = pandas_agent.PandasAgent(csv_data)
        forecast = agent.forecast_time_series(date_column, value_column, periods)

        if isinstance(forecast, str):
            return jsonify({"error": forecast}), 400

        return jsonify(forecast.to_dict(orient="records"))
    except Exception as e:
        logging.error("Error in /forecast endpoint: %s", str(e))
        return jsonify({"error": "Failed to generate forecast"}), 500

@app.route("/switch_mode", methods=["POST"])
def switch_mode():
    """Switch between CSV and SQL modes"""
    data = request.get_json()
    mode = data.get("mode")
    
    if mode not in ["csv", "sql"]:
        return jsonify({"error": "Invalid mode"}), 400
    
    # Check if we have the necessary data for the mode
    if mode == "csv" and not session.get("csv_filepath"):
        return jsonify({"error": "No CSV file uploaded"}), 400
    
    if mode == "sql" and not all([
        session.get("sql_server"),
        session.get("sql_database"),
        session.get("sql_username"),
        session.get("sql_password")
    ]):
        return jsonify({"error": "Database connection information is missing"}), 400
    
    # Set the mode
    session["mode"] = mode
    return jsonify({"message": f"Switched to {mode.upper()} mode successfully"}), 200

# Add this endpoint to your app.py file

@app.route("/disconnect", methods=["POST"])
def disconnect_database():
    """Disconnect from the database and clean up resources"""
    if session.get("mode") != "sql":
        return jsonify({"error": "No database connection active"}), 400
    
    try:
        # Create SQL agent to access MCP client
        agent_context = session.get("agent_context")
        if agent_context is None:
            agent_context = MemorySaver()
            agent_context.storage.default_factory = defaultdictoverride
        
        sql_agent = SQLAgent(
            session.get("sql_server"),
            session.get("sql_database"),
            session.get("sql_username"),
            session.get("sql_password"),
            agent_context
        )
        
        # Use the MCP client to disconnect
        sql_agent.mcp_client.disconnect()
        
        # Clear session data
        session.pop("sql_server", None)
        session.pop("sql_database", None)
        session.pop("sql_username", None)
        session.pop("sql_password", None)
        session["mode"] = "csv"  # Reset to CSV mode
        
        # Return success
        return jsonify({"message": "Disconnected successfully"}), 200
    except Exception as e:
        logging.error(f"Error disconnecting from database: {str(e)}")
        
        # Still clear session data even if there was an error
        session.pop("sql_server", None)
        session.pop("sql_database", None)
        session.pop("sql_username", None)
        session.pop("sql_password", None)
        session["mode"] = "csv"
        
        return jsonify({"error": f"Error during disconnect: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True)