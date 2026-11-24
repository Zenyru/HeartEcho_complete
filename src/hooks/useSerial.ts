"use client";

import { useEffect, useRef, useState } from "react";

// Connects to the Arduino over USB (Web Serial API, Chrome / Edge only)
// and calls onLine("BPM:72") for every line the Arduino prints.
export function useSerial(onLine: (line: string) => void) {
  const [connected, setConnected] = useState(false);
  const portRef = useRef<SerialPort | null>(null); //                                 the USB port
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null); // reads bytes from it

  // always call the NEWEST onLine (it changes every time the page re-draws)
  const onLineRef = useRef(onLine);
  useEffect(() => {
    onLineRef.current = onLine;
  }, [onLine]);

  const connect = async () => {
    if (!("serial" in navigator)) {
      alert("Your browser can't talk to USB devices. Please open this page in Chrome or Edge.");
      return;
    }

    try {
      // 1) the browser shows a list of USB devices; the user picks the Arduino
      const port = await navigator.serial.requestPort();
      // 2) open it at the same speed as Serial.begin(115200) on the Arduino
      //    bufferSize: room for 16 KB of waiting data, so no line is lost while the page is busy drawing
      await port.open({ baudRate: 115200, bufferSize: 16384 });
      portRef.current = port;
      setConnected(true);

      // 3) keep reading until the cable is unplugged or we disconnect
      const reader = port.readable!.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder(); // turns bytes into text
      let leftover = ""; //                  a line that hasn't finished arriving yet

      while (true) {
        const { value, done } = await reader.read(); // wait for the next bytes
        if (done) break; //                             reader was cancelled → stop

        leftover += decoder.decode(value, { stream: true }); // add the new text
        const lines = leftover.split("\n"); //                  cut it into lines
        leftover = lines.pop() ?? ""; //                         the last piece may be half a line → keep it for later
        for (const line of lines) {
          onLineRef.current(line); // "BPM:72", "GSR:430", ...
        }
      }
    } catch (error) {
      console.log("Serial stopped:", error); // user closed the picker, or the cable was unplugged
      // "NetworkError" = the port exists but something else is already using it
      if (error instanceof Error && error.name === "NetworkError") {
        alert(
          "Couldn't open the Arduino: another program is using it.\n\n" +
            "• Close the Arduino IDE's Serial Monitor / Serial Plotter\n" +
            "• Close any other tab with this website open\n" +
            "• If it still fails: unplug the USB cable, plug it back in, and try again",
        );
      }
    }

    // clean up whatever happened
    readerRef.current?.releaseLock();
    await portRef.current?.close().catch(() => {});
    readerRef.current = null;
    portRef.current = null;
    setConnected(false);
  };

  const disconnect = async () => {
    await readerRef.current?.cancel(); // makes reader.read() return done → the loop above ends and cleans up
  };

  return { connected, connect, disconnect };
}
