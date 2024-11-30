import os
import re
import sqlite3
import uuid
import pandas
import logging
from typing import Any, Literal

from dotenv import load_dotenv
from pandas_settings import (
    CRITICAL_FAILURE_FALLBACK_MESSAGE,
    GRAPHRECURSION_FALLBACK_MESSAGE,
    SYSTEM_PROMPT,
    SYSTEM_PROMPT_DATA,
)
from utils.extra import patch_langchain_openai_toolcall, show_graph
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import AzureChatOpenAI

# from langchain_core.tools import tool
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph, MessagesState
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode
from langgraph.errors import GraphRecursionError

# from langchain_experimental.utilities import PythonREPL
from langchain_experimental.tools.python.tool import PythonAstREPLTool

from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
from prophet import Prophet

load_dotenv()

logger = logging.getLogger("kinaxis-agent")

# Czy pokazywać obrazek grafu
SHOW_GRAPH = False
# Liczba wierszy do pokazania w system prompcie
DF_HEAD_NUM = 6

patch_langchain_openai_toolcall()

saver = MemorySaver()

class PandasAgent:
    graph: CompiledStateGraph
    dataframe: pandas.DataFrame
    extra_content: str | None

    def __init__(self, df: pandas.DataFrame, context_memory: Any | None = None):
        self.memory = MemorySaver()
        if context_memory is not None:
            logger.debug("memory exists")
            self.memory = context_memory
        else:
            logger.warn("memory not provided")
        # logger.debug(self.memory.storage)
        self.extra_content = None
        self.dataframe = df
        df_locals = {"df": self.dataframe}
        # Toolsy do dyspozycji
        tools = [PythonAstREPLTool(locals=df_locals)]
        # Nasz model LLM
        model = AzureChatOpenAI(
            deployment_name=os.getenv(
                "AZURE_OPENAI_DEPLOYMENT"
            ),  # Ensure the deployment name matches what you see in Azure
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            openai_api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
            temperature=0,
        ).bind_tools(tools)

        # Wierzchołek przy początku który "dokleja" do promptów System Message i początek naszej
        # tabelki aby LLM wiedział z czym się je, zanim wykona zapytania.
        def get_dataframe_head(state: MessagesState):
            logger.info("Adding evaluated system prompt")
            # TODO: zgrabniejszy df -> str, żeby na dużych komórkach w df nie
            #       marnował tokenów
            prepared_sysprompt = (
                SYSTEM_PROMPT
                + SYSTEM_PROMPT_DATA.format(dhc=DF_HEAD_NUM)
                + self.dataframe.head(DF_HEAD_NUM).to_string()
            )
            # logger.debug(prepared_sysprompt)
            state["messages"].insert(0, SystemMessage(prepared_sysprompt))

        # Funkcja/wierzchołek która rzeczywiście wysyła zapytanie i obecny stan
        # do naszego modelu LLM.
        def call_model(state: MessagesState):
            messages = state["messages"]
            logger.info("Calling LLM")
            response = model.invoke(messages)
            if len(response.content) > 0 and not response.tool_calls:
                logger.info("LLM Response:\n" + (response.content))
            elif not response.tool_calls:
                logger.warning("LLM didn't respond with any content!")
            # We return a list, because this will get added to the existing list
            return {"messages": [response]}

        # Wierzchołek do procesowania naszego toola/tooli
        # TODO: Można w przyszłości np. jednocześnie odpalić kod Pandas i kod SQL który
        # AI stworzy i je wykonać równocześnie i wziąść lepszy wynik!
        #
        # Tu istnieją jeszcze dwa node'y do logowania bo nie wiem jak to lepiej zrobić :/
        tool_node = ToolNode(tools)

        def tool_node_pre(state: MessagesState):
            available_tools = {tool.name for tool in tools}
            msg = state["messages"][-1]
            if not msg.tool_calls:
                logger.error("We're in tool_node_pre but no tool calls were made!")
                raise Exception
            for tc in msg.tool_calls:
                if tc["name"] not in available_tools:
                    logger.error(
                        f"The model tried to call an invalid tool: {tc['name']}"
                    )
                    raise Exception
                logger.info(f"LLM calls <{tc["name"]}>")
                if tc["name"] == "python_repl_ast":
                    original_code = tc["args"]["query"]
                    code = original_code
                    logger.debug(f"LLM calls <{tc["name"]}>.")
                    # "Cicha" podmiana kodu żeby zapisywał grafiki wykresów gdzie chcemy
                    if "matplotlib" in code or "plt" in code:
                        logger.debug("Changing LLM-provided code.")
                        remove_extra_pattern = re.compile(r"(\S*)plt.savefig\(.*")
                        plt_pattern = re.compile(r"(\S*)(plt\.show\(\))")
                        code = remove_extra_pattern.sub("", code)
                        self.extra_content = uuid.uuid4()
                        code = plt_pattern.sub(
                            f'\\1plt.savefig("./frontend/dist/assets/{self.extra_content}.png")',
                            code,
                        )
                        # TODO: import common things used by gpt, like "pd".
                        # TODO: Tie this image to the session somehow.
                        code = 'import matplotlib\nmatplotlib.use("agg")\n' + code
                        tc["extra"] = dict()
                        tc["extra"]["original_code"] = original_code
                        tc["extra"]["modified_code"] = code
                        tc["args"]["query"] = code
                        logger.debug(
                            f"##### Unmodified LLM code: #####\n{original_code}"
                        )
                    logger.debug(f"##### Code to be executed: #####\n{code}")

        def tool_node_post(state: MessagesState):
            msg = state["messages"][-1]
            # Azure OpenAI is stupid.
            if isinstance(msg.content, str):
                msg.content = [{"type": "text", "text": msg.content}]
            logger.info("Tool call finished")
            logger.debug(f"Tool call result:\n{msg.content}")
            # "Cicha" podmiana kodu - cofnięcie, żeby była... "cicha"
            call_msg = state["messages"][-2]
            for tc in call_msg.tool_calls:
                if "extra" not in tc:
                    continue
                original_code = tc.get("extra").get("original_code")
                if not isinstance(original_code, str) or len(original_code) < 1:
                    continue
                logger.debug(
                    "Reverting LLM-provided code in context to the original to avoid LLM confusion"
                )
                tc["args"]["query"] = original_code

        # Wierzchołek warunkowy sprawdzający, czy AI użyło tool call'a.
        # Jeśli użyło, chcemy go wykonać, więc zwracamy "tools" aby langgraph przeszedł
        # do następnego wierzchołka w grafie o nazwie "tools" (który już ten tool wykona
        # i doklei jego output).
        # Jeśli odpowiada normalną odpowiedzią to chce się zwrócić do użytkownika więc
        # kończymy graf i później wyświetlamy tą odpowiedź.
        def should_continue(state: MessagesState) -> Literal["tools_pre", END]:
            logger.info("Deciding if we should continue")
            messages = state["messages"]
            last_message = messages[-1]
            if last_message.tool_calls:
                logger.info("Last message was a tool call request, moving to tool")
                return "tools_pre"
            logger.info("Last message was a natural response, finishing")
            return END

        # ===================
        #   DEFINICJA GRAFU
        # ===================
        logger.info("Constructing graph")
        graph = StateGraph(MessagesState)

        # Poszczególne wierzchołki
        graph.add_node("df_head", get_dataframe_head)
        graph.add_node("agent", call_model)
        graph.add_node("tools_pre", tool_node_pre)
        graph.add_node("tools", tool_node)
        graph.add_node("tools_post", tool_node_post)

        # Krawędzie między wierzchołkami
        graph.add_edge(
            START, "df_head"
        )  # Najpierw czytami i dodajemy do prompta fragment tabelki
        graph.add_edge("df_head", "agent")  # To idzie do AI
        # Warunkowa krawędź - w zależności od stanu i logiki wewnątrz wybiera
        # "co robimy dalej"
        # w tym przypadku albo kończymy (przy odpowiedzi naturalnej LLM - idziemy
        # do END) albo wykonujemy tool gdy LLM o to poprosi (i idziemy do "tools")
        graph.add_conditional_edges(
            "agent",
            should_continue,
        )
        graph.add_edge(
            "tools_pre", "tools"
        )  # Tu proxy tylko zrobiłem do logowania bo nwm jak inaczej z ToolNode.
        graph.add_edge("tools", "tools_post")
        graph.add_edge(
            "tools_post", "agent"
        )  # Wynik tools zawsze chcemy zwrócić agentowi

        # "skompiluj" graf
        logger.info("Compiling graph")
        self.graph = graph.compile(checkpointer=self.memory)

        # graficzny podgląd grafu
        if SHOW_GRAPH:
            logger.info("Showing graph")
            show_graph(self.graph)
        logger.info("Finished PandasAgent.__init__()")

        # TODO: Jak działą MemorySaver()? Chyba to chcemy
        # TODO: Co jak wrzucimy kilka plików .csv? Kilka DF jak to jest w wbudowanym
        #       pandas agencie?

    def invoke(self, message, full_context=False):
        config = {"configurable": {"thread_id": "1"}}  # "recursion_limit": 1
        try:
            messages = self.graph.invoke(
                {"messages": [HumanMessage(content=message)]}, config
            )
            if full_context:
                return messages
            return messages["messages"][-1].content
        except GraphRecursionError as e:
            logger.exception(e)
            # TODO: https://langchain-ai.github.io/langgraph/how-tos/return-when-recursion-limit-hits/?h=recursion#with-returning-state
            return GRAPHRECURSION_FALLBACK_MESSAGE
        except Exception as e:
            logger.exception(e)
            return CRITICAL_FAILURE_FALLBACK_MESSAGE

    def clear_memory(self):
        logger.info("Clearing chat context (storage/memory)")
        self.memory.storage.clear()
        logger.debug(self.memory.storage)

    def forecast_time_series(
        self, date_column: str, value_column: str, periods: int = 10
    ):
        # Ensure columns exist
        if (
            date_column not in self.dataframe.columns
            or value_column not in self.dataframe.columns
        ):
            return "The specified columns do not exist in the dataframe."

        # Prepare data for Prophet
        df_prophet = self.dataframe[[date_column, value_column]].rename(
            columns={date_column: "ds", value_column: "y"}
        )

        # Initialize and fit the Prophet model
        model = Prophet()
        model.fit(df_prophet)

        # Create a dataframe for future predictions
        future = model.make_future_dataframe(periods=periods)
        forecast = model.predict(future)

        # Return the forecast
        return forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]]

    def predict_with_regression(self, feature_columns, target_column):
        # Ensure columns exist
        for col in feature_columns + [target_column]:
            if col not in self.dataframe.columns:
                return f"Column '{col}' does not exist in the dataframe."

        X = self.dataframe[feature_columns]
        y = self.dataframe[target_column]

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        model = LinearRegression()
        model.fit(X_train, y_train)

        predictions = model.predict(X_test)
        mse = mean_squared_error(y_test, predictions)

        return {"mse": mse, "predictions": predictions.tolist()}


# Test
if __name__ == "__main__":
    sa = PandasAgent(pandas.read_csv("./uploads/table.csv"))
    result = sa.invoke("Show a bar chart of compliance for each factory")
    print("\n\nLLM answer: ")
    print(result)
