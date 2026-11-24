// ---------- Room comfort ----------
// The DHT22 measures the ROOM, not the person. We use it to answer:
// "Is this room good for relaxing?"
// A comfortable room for relaxing is about 20–25 °C with 40–60% humidity.
const MIN_TEMP = 20;
const MAX_TEMP = 25;
const MIN_HUMIDITY = 40;
const MAX_HUMIDITY = 60;

export type RoomComfort = {
  label: string; //        one or two words, e.g. "Comfortable", "Warm & humid"
  tip: string; //          what to do about it
  good: boolean | null; // true = comfortable, false = could be better, null = no reading
};

export function roomComfort(temp: number | null, humidity: number | null): RoomComfort {
  // no reading yet
  if (temp === null || humidity === null) {
    return { label: "No reading", tip: "Plug in the room sensor (DHT22).", good: null };
  }

  // describe the temperature and the humidity separately…
  let tempWord = ""; //  stays "" when the temperature is fine
  if (temp > MAX_TEMP) tempWord = "Warm";
  if (temp < MIN_TEMP) tempWord = "Cool";

  let airWord = ""; //   stays "" when the humidity is fine
  if (humidity > MAX_HUMIDITY) airWord = "humid";
  if (humidity < MIN_HUMIDITY) airWord = "dry";

  // …then put them together
  if (tempWord === "" && airWord === "") {
    return { label: "Comfortable", tip: "A good room for relaxing.", good: true };
  }

  let label = "";
  if (tempWord !== "" && airWord !== "") label = tempWord + " & " + airWord; // "Warm & humid"
  else if (tempWord !== "") label = tempWord; //                               "Warm"
  else label = airWord.charAt(0).toUpperCase() + airWord.slice(1); //          "Humid" (capital first letter)

  // the most useful tip
  let tip = "";
  if (temp > MAX_TEMP) tip = "A warm room makes it harder to relax. A fan or an open window helps.";
  else if (temp < MIN_TEMP) tip = "Cold makes muscles tense. A jacket or blanket helps.";
  else if (humidity > MAX_HUMIDITY) tip = "Humid air feels heavy. A fan helps the air move.";
  else tip = "Dry air can make breathing feel rough. Sip some water.";

  return { label, tip, good: false };
}
