export const sendChatMessage = async (message: string, language: string) => {
  try {
    const baseUrl = import.meta.env.VITE_API_URL;

    const res = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        language
      })
    });

    if (!res.ok) {
      console.error("Backend returned:", res.status);
      return { response: "Server error. Try again." };
    }

    const data = await res.json();
    console.log("AI Response:", data);
    return data;

  } catch (err) {
    console.error("Network/Request error:", err);
    return { response: "Network error. Try again." };
  }
};
