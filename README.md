# openai-throttler

#### TLDR

`openai-throttler` aims to make it dead simple for developers to leverage the Open AI API without having to manage the nitty gritty aspects of throttling.

#### Introduction

`openai-throttler` is a utility for throttling requests to the OpenAI API. It allows you to control the number of requests you make to the OpenAI API per minute and the number of tokens per request.

#### Background

Developers who leverage the Open AI API must make sure to adhere to its strict rate and token limits. This is especially true for the GPT-3.5-Turbo model. Given the nascence of the Open AI ecosystem and the lack of tooling, developers are currently expected to implement their own, custom throttling solutions. `openai-throttler` aims to make it dead simple for developers to leverage the Open AI API without having to manage the nitty gritty aspects of throttling.

#### Paradigm

`openai-throttler` is meant to be run as part of a dedicated, continuosuly running service separate from your API. More specifically, you should create a service that pulls pending request objects from a data-store (such as a database, or queue). These request objects should originate from your API anytime a user or machine makes a request that leads to a request to Open AI.

`openai-throttler` can be thought of as a single central scheduler which manages the number of requests being made to the Open AI per time interval, the number of tokens per request and per time interval, and failed/successful Open AI API responses.

_Unless you have an enterprise account with Open AI, it's unlikely that you can surpass the pay-as-you-go rate limiting restrictions. This means that it isn't advantageous to run a distributed service to send requests to OpenAI (as might be done when interacting with other mature 3rd party APIs)._

![Alt text](docs/images/architecture.jpeg?raw=true "Architecture Diagram")

# Future Direction

_Please contribute to this library by implementing the features below, suggesting new features and catching/fixing bugs._

- Desired features + Known Limitations

  - Decouple library and OpenAI API request creation: Currently, the library implements the call to the OpenAI API using the GPT-3.5-Turbo model, but this is obviously a big limitation which needs to be corrected in future a implementation. Creating the request should ideally be the developers job. However, the library should still be knowledageable of how many tokens are a part of the request, and when the request completes. A proper spec will be created along with an issue to track this.

  - Create a process for breaking up large prompts by maximum allowable input and output token size. A beta exists for this, and will be released at a later date.

  - Updates to this README: If you're capable of experimenting with and comprehending the library, then please feel free to add necessary instructions and explainers to this documentaiton.

# Example Usage

```typescript
require("dotenv").config();
import { createThrottler } from "./throttler";

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
```
