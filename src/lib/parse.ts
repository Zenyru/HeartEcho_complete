import type { ArduinoMessage } from "../types/message";

export function parseArduinoMessage(message: string): ArduinoMessage | null {
  //removing the whitespace from the message in the beginning and end of the message
  const clean = message.trim();
  // "W:-35" → one point of the live pulse wave (comes 50 times a second)
  if (clean.startsWith("W:")) {
    const value = parseInt(clean.slice(2));
    if (!isNaN(value)) {
      return { type: "wave", value: value };
    }
  }
  //checking if the message is "BEAT" and returning the corresponding object
  if (clean === "BEAT") {
    return { type: "beat" };
  }
  //checking if the message is "NOFINGER" and returning the corresponding object
  if (clean === "NOFINGER") {
    return { type: "noFinger" };
  }
  //checking if the message starts with "BPM:" and extracting the bpm value
  if (clean.startsWith("BPM:")) {
    //making the the bpm value an integer and checking if it's a valid number
    const bpmValue = parseInt(clean.split(":")[1]);
    if (!isNaN(bpmValue)) {
      return { type: "bpm", bpm: bpmValue };
    }
  }
  // "GSR:430" → { type: "gsr", value: 430 }
  if (clean.startsWith("GSR:")) {
    const value = parseInt(clean.split(":")[1]);
    if (!isNaN(value)) {
      return { type: "gsr", value: value };
    }
  }
  // "ROOM:27.4,68" → { type: "room", temp: 27.4, humidity: 68 }
  if (clean.startsWith("ROOM:")) {
    const parts = clean.split(":")[1].split(","); //  "27.4,68" → ["27.4", "68"]
    const temp = parseFloat(parts[0]); //               parseFloat because it has decimals
    const humidity = parseFloat(parts[1]);
    if (!isNaN(temp) && !isNaN(humidity)) {
      return { type: "room", temp: temp, humidity: humidity };
    }
  }
  return null;
}
