import { signalMessage } from "../types/message";


export default function StatusLine({ status }: { status: signalMessage }) {
  return (
    <div className="text-center text-sm text-gray-400 ">
     
      {/* returning the status message related to the signal status */}

      {status === "waiting" && "Waiting for signal..."}
      {status === "good" && "Signal is good."}
      {status === "unsteady" && "Signal is unsteady."}
      {status === "noFinger" && "Please place your finger on the sensor."}
      {status === "noData" && "No data from the Arduino. Check the USB cable and close the Serial Monitor."}
    </div>
  );
}