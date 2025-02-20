json_schema_generate = {
    "title": "generate_sql",
    "description": "Generate an SQL query",
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "The generated SQL query",
            "default": None,
        }
    },
    "required": ["query"],
}

json_schema_should = {
    "title": "should_generate",
    "description": "Should you generate an SQL query to answer the user? If user asks about doing a graph, respond no",
    "type": "object",
    "properties": {
        "rating": {
            "type": "string",
            "description": "Based on the previous information, should you generate an SQL query. 'yes' or 'no'",
            "default": None,
        },
    },
    "required": ["rating"],
}
json_schema_response_query = {
    "title": "response generator",
    "description": "Generate an answer based on the retrieved data from sql and the prompt.",
    "type": "object",
    "properties": {
        "response": {
            "type": "string",
            "description": "Generated answer based on the retrieved data from sql and the prompt.",
            "default": None,
        },
    },
    "required": ["response"],
}
