require("dotenv").config();
import { createThrottler } from "../../src/index";

let t = createThrottler({
  apiKey: process.env.OPENAI_API_KEY,
});

t.init();

t.emitter.on("data", (...args) => {
  console.log("data", args[0].data[0]?.result.data.choices[0]);
  console.log("data", args[0].data[1]?.result.data.choices[0]);
  //  This fires everytime all of the requests in a group have resolved successfully.
  //   .. EXAMPLE RESPONSE:
  //   ..  @ some timestamp, t0 this "data" is dispatched for one group of requests:
  //   ..      data {
  //   ..        message: {
  //   ..          role: 'assistant',
  //   ..          content: 'The distance between Paris and San Francisco is approximately 5,579 miles (8,976 kilometers).'
  //   ..        },
  //   ..        finish_reason: 'stop',
  //   ..        index: 0
  //   ..      }
  //   ..      data {
  //   ..        message: {
  //   ..          role: 'assistant',
  //   ..          content: 'The location of the Super Bowl is decided by the National Football League (NFL) through a bidding process. Cities and stadiums interested in hosting the Super Bowl submit proposals to the NFL, which evaluates the proposals based on a variety of factors such as stadium capacity, infrastructure, weather, and potential economic impact on the local community. The NFL then selects a host city several years in advance, typically announcing the decision three to four years before the game.'
  //   ..        },
  //   ..        finish_reason: 'stop',
  //   ..        index: 0
  //   ..      }
});

t.addToQueue([
  [
    // Requests grouped in an array count as a request "group" and are linked internally by an automatically generated unique group identifier, "groupId".
    // All of the requests in a request group must complete before the event emitter fires ^^ see t.emitter.on("data") for more context.
    {
      id: "id-1",
      text: "How far is Paris from San Francisco?",
    },
    {
      id: "id-2",
      text: "How is the location of Super Bowl Decided?",
    },
  ],
  [
    {
      id: "id-3",
      text: "How cool am I?",
    },
  ],
]);
