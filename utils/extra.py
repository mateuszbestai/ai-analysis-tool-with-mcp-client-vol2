from langchain_openai import AzureChatOpenAI
import os
from IPython.display import Image
from PIL import Image as PILImage
from io import BytesIO
from langchain_core.runnables import RunnableLambda, RunnableWithFallbacks
from langgraph.prebuilt import ToolNode
from langchain_core.messages import ToolMessage
from typing import Any
import langchain_core.utils.function_calling as HOTPATCHING_THIS

import logging


class CustomFormatter(logging.Formatter):
    white = "\x1b[37;20m"
    grey = "\x1b[90;20m"
    yellow = "\x1b[33;20m"
    bright_blue = "\x1b[94;20m"
    red = "\x1b[31;20m"
    bold_red = "\x1b[31;1m"
    bold = "\x1b[1m"
    reset = "\x1b[0m"
    format_pre = f"{bold}%(asctime)s - %(name)s - %(levelname)s > {reset}"
    format_msg = "%(message)s "
    format_file = f"{reset}{grey}(%(filename)s:%(lineno)d){reset}"

    FORMATS = {
        logging.DEBUG: bright_blue,
        logging.INFO: white,
        logging.WARNING: yellow,
        logging.ERROR: red,
        logging.CRITICAL: bold_red,
    }

    def format(self, record):
        log_fmt = (
            self.FORMATS.get(record.levelno)
            + self.format_pre
            + self.format_msg
            + self.format_file
        )
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)


# create logger
logger = logging.getLogger("kinaxis-agent")
ch = logging.StreamHandler()
ch.setFormatter(CustomFormatter())
ch.setLevel(logging.DEBUG)
logger.setLevel(logging.DEBUG)
logger.addHandler(ch)


def initialize_llm():
    llm = AzureChatOpenAI(
        deployment_name="gpt-4o",  # Ensure the deployment name matches what you see in Azure
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        openai_api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
    )
    return llm


def show_graph(graph):
    try:
        i = Image(graph.get_graph().draw_mermaid_png())
        image_data = i.data
        pil_image = PILImage.open(BytesIO(image_data))
        pil_image.show()
    except Exception as e:
        print(e)
        pass


def create_tool_node_with_fallback(tools: list) -> RunnableWithFallbacks[Any, dict]:
    """
    Create a ToolNode with a fallback to handle errors and surface them to the agent.
    """
    return ToolNode(tools).with_fallbacks(
        [RunnableLambda(handle_tool_error)], exception_key="error"
    )


def handle_tool_error(state) -> dict:
    error = state.get("error")
    tool_calls = state["messages"][-1].tool_calls
    return {
        "messages": [
            ToolMessage(
                content=f"Error: {repr(error)}\n please fix your mistakes.",
                tool_call_id=tc["id"],
            )
            for tc in tool_calls
        ]
    }


def patch_langchain_openai_toolcall():
    """
    DANGER!
    This will modify this function for the WHOLE PROGRAM.
    It sucks but it's is better than manually changing the library and I'm not doing
    langchain's work for them.
    """
    original = HOTPATCHING_THIS.convert_to_openai_function

    def convert_to_openai_function_proxy(*args, **kwargs):
        logger.warning("Forcing OpenAI strict function calling")
        kwargs["strict"] = True
        return original(*args, **kwargs)

    HOTPATCHING_THIS.convert_to_openai_function = convert_to_openai_function_proxy
