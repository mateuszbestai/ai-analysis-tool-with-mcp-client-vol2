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

from pandas_agent import *
from sql_agent import *

load_dotenv()


# Miało to jakoś łączyć tego sql agenta i pandas agenta ale narazie chyba nie jest to potrzebne
class sql_agent:
    def __init__(self):
        pass
