import { useState, useEffect, useRef } from "react";
import ImageOverlay from "./ImageOverlay";

function Chatbox() {
  const [messages, setMessages] = useState([]);
  const [questionInput, setQuestionInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [imageFullScreenSrc, setImageFullScreenSrc] = useState("");
  const [isImageFullScreen, setIsImageFullScreen] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function handleQuestionInputChange(e) {
    setQuestionInput(e.target.value);
  }

  function clickAskBtn() {
    if (!questionInput.trim()) return;

    const userMessage = {
      messageType: "user",
      content: questionInput,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setQuestionInput("");
    setIsLoading(true);

    fetch("/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: questionInput }),
    })
      .then((response) => response.json())
      .then((data) => {
        const botMessage = {
          messageType: "bot",
          content: data.answer || "",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          table: data.table || null,
          image: data.image ? "/assets/" + data.image : null,
        };
        setMessages((prevMessages) => [...prevMessages, botMessage]);
      })
      .catch((error) => {
        console.error("Error:", error);
        const errorMessage = error.message || "Unknown error occurred.";
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            messageType: "bot",
            content: `Error: ${errorMessage}`,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }

  function renderTable(tableData) {
    return (
      <table className="chat-table">
        <thead>
          <tr>
            {tableData.headers.map((header, index) => (
              <th key={index}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function clickClearBtn() {
    fetch("/clear", {
      method: "POST",
    }).then((res) => {
      if (res.ok) {
        setMessages([]);
      }
    });
  }

  function clickEnterBtn(e) {
    if (e.keyCode === 13) {
      e.preventDefault();
      clickAskBtn();
    }
  }

  function showImageFullScreen(src) {
    setImageFullScreenSrc(src);
    setIsImageFullScreen(true);
    document.body.classList.add("stop-scroll");
  }

  function hideImageFullScreen() {
    document.body.classList.remove("stop-scroll");
    setIsImageFullScreen(false);
  }

  return (
    <>
      <div className="messages-container">
        <div className="messages">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`message-row ${
                message.messageType === "user" ? "message-row-user" : "message-row-bot"
              }`}
            >
              <div
                className={`message-bubble ${
                  message.messageType === "user" ? "user-bubble" : "bot-bubble"
                }`}
              >
                {message.content && <p className="message-content">{message.content}</p>}
                {message.table && renderTable(message.table)}
                {message.image && (
                  <div
                    className="message-image"
                    onClick={() => showImageFullScreen(`${message.image}.png`)}
                  >
                    <img
                      src={`${message.image}.png?t=${Date.now()}`}
                      alt={message.content || "Message Attachment"}
                      onError={(e) => (e.target.src = "/assets/fallback-image.png")}
                    />
                  </div>
                )}
                <span className="message-timestamp">{message.timestamp}</span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-row message-row-bot">
              <div className="message-bubble bot-bubble">
                <svg
                  className="loader-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <circle
                    className="loader-circle"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="loader-path"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  ></path>
                </svg>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          clickAskBtn();
        }}
        className="input-form"
      >
        <div className="input-container">
          <input
            type="text"
            value={questionInput}
            onChange={handleQuestionInputChange}
            onKeyDown={clickEnterBtn}
            placeholder="Type your message..."
            className="input-field"
          />
          <button
            type="submit"
            disabled={!questionInput.trim() || isLoading}
            className="send-button"
          >
            <svg
              className="send-icon"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 10l9 4 9-4-9-4-9 4zm0 4v6l9-4 9 4v-6"
              />
            </svg>
          </button>
          <button type="button" className="clear-button" onClick={clickClearBtn}>
            Clear
          </button>
        </div>
      </form>

      {isImageFullScreen && (
        <ImageOverlay imgsrc={imageFullScreenSrc} close={hideImageFullScreen} />
      )}
    </>
  );
}

export default Chatbox;
