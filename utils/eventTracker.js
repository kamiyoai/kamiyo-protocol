export function trackEvent(eventName, eventData = {}) {
    const events = JSON.parse(localStorage.getItem("kamiyo_events")) || [];

    events.push({
        eventName,
        eventData,
        timestamp: new Date().toISOString(),
    });

    localStorage.setItem("kamiyo_events", JSON.stringify(events));

    // Optionally, send data in batches
    if (events.length >= 5) {
        sendEventsToServer();
    }
}

export function sendEventsToServer() {
    const events = JSON.parse(localStorage.getItem("kamiyo_events")) || [];
    if (events.length === 0) return;

    fetch("/api/track", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ events }),
    })
        .then(() => {
            localStorage.removeItem("kamiyo_events");
        })
        .catch((err) => console.error("Error sending analytics:", err));
}
