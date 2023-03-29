import EventEmitter from "events";
import { AxiosResponse } from "axios";
import {
  Configuration,
  ConfigurationParameters,
  CreateChatCompletionResponse,
  OpenAIApi,
} from "openai";
import { v4 as uuidv4 } from "uuid";
import {
  setIntervalAsync,
  clearIntervalAsync,
  SetIntervalAsyncTimer,
} from "set-interval-async";
import { encode, decode } from "gpt-3-encoder";

enum RequestStatus {
  Success,
  Pending,
  Fail,
}

interface RequestQueueItem {
  id: string;
  groupId: string;
  batchId: number;
  status?: RequestStatus;
  prompt: string;
  result?: AxiosResponse<CreateChatCompletionResponse, any>;
  finalized: boolean;
  tokenCount: number;
  retryCount: number;
}

interface Queue {
  [id: string]: {
    requests: RequestQueueItem[];
  };
}

interface Prompt {
  id: string;
  text: string;
}

interface CallbackArgs {
  id: string;
  data: AxiosResponse<CreateChatCompletionResponse, any>;
}

const queue: Queue = {};
const requestsQueue: RequestQueueItem[] = [];

const getTokenCount = (text: string): number => {
  return encode(text).length;
};

export function createThrottler(openAIConfiguration: ConfigurationParameters): {
  init: () => void;
  addToQueue: (prompt: Prompt | Prompt[] | Prompt[][]) => void;
  clear: () => void;
  emitter: EventEmitter;
} {
  const emitter = new EventEmitter();

  const configuration = new Configuration(openAIConfiguration);

  const openai = new OpenAIApi(configuration);

  const MINUTE = 60000;
  const REQUEST_TIME_INTERVAL = 1000;
  const MAX_REQUESTS_PER_TIME_INTERVAL = 2;
  const MAX_REQUESTS_PER_MINUTE = 3500;
  const MAX_TOKEN_COUNT_PER_MINUTE = 90000;
  const MAX_TOKEN_COUNT_PER_REQUEST = 2700;
  const MAX_TOKEN_COUNT_PER_INPUT = 1200;
  const TOKEN_COUNT_MULTIPLIER = 1.75;
  const MAX_TOKEN_IN_AND_OUT = 4000;
  const MAX_PENDING_FILE_QUEUE_LENGTH = 30;
  let batcher_interval = null;
  let timer_interval = null;
  let requestQReader = null;

  let tokens_requested_this_minute = 0;
  let requests_made_this_minute = 0;
  let requests_made_this_time_interval = 0;
  let num_of_qs = 0;
  let num_of_sec = 0;
  let timerInterval: NodeJS.Timer;
  let readRequestQueue: SetIntervalAsyncTimer<[]>;
  let batcherInterval: SetIntervalAsyncTimer<[]>;

  const clear = () => {
    if (timerInterval) clearInterval(timerInterval);
    if (readRequestQueue) clearIntervalAsync(readRequestQueue);
    if (batcherInterval) clearIntervalAsync(batcherInterval);
  };

  const batchPrompt = (prompt: Prompt, groupId: string, batchId: number) => {
    let tokenCount = getTokenCount(prompt.text);
    let r: RequestQueueItem = {
      id: prompt.id,
      groupId,
      batchId,
      prompt: prompt.text,
      tokenCount: tokenCount,
      finalized: false,
      retryCount: 0,
    };
    if (queue[groupId]) {
      queue[groupId].requests.push(r);
    } else {
      queue[groupId] = {
        requests: [r],
      };
    }
    return { ...r };
  };

  const addToQueue = (prompt: Prompt | Prompt[] | Prompt[][]) => {
    if (!Array.isArray(prompt)) {
      let groupId = uuidv4();
      requestsQueue.push(batchPrompt(prompt, groupId, 0));
    } else {
      let groupId = uuidv4();

      let requests: RequestQueueItem[] = [];
      prompt.map((prompt, idx) => {
        if (Array.isArray(prompt)) {
          let groupId = uuidv4();
          let requests = prompt.map((prompt, idx) =>
            batchPrompt(prompt, groupId, idx)
          );
          requestsQueue.push(...requests);
        } else {
          requests.push(batchPrompt(prompt, groupId, idx));
        }
      });
      if (requests.length > 0) {
        requestsQueue.push(...requests);
      }
    }
  };

  const makeOpenAICall = async (
    item: RequestQueueItem
  ): Promise<AxiosResponse<CreateChatCompletionResponse, any>> =>
    new Promise(async (res, rej) => {
      if (!queue[item.groupId]) {
        console.log("Warning: Request item not found in queue");
        rej();
        return;
      }
      let matching_request = queue[item.groupId].requests.find(
        (el) => el.batchId === item.batchId
      );

      try {
        let prompt = item.prompt;
        let s = await openai.createChatCompletion(
          {
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
            n: 1,
            temperature: 0.7,
            max_tokens: MAX_TOKEN_IN_AND_OUT - MAX_TOKEN_COUNT_PER_REQUEST,
          },
          {
            timeout: 60 * 5 * 1000,
          }
        );

        if (matching_request) {
          matching_request.status = RequestStatus.Success;
          matching_request.result = s as AxiosResponse<
            CreateChatCompletionResponse,
            any
          >;
          res(s as AxiosResponse<CreateChatCompletionResponse, any>);
        } else {
          console.log(
            "warning: no matching request found in requests queue for openai response"
          );
          rej();
          return;
        }
      } catch (e) {
        if (matching_request) {
          console.log({ e });
          matching_request.status = RequestStatus.Fail;
        } else {
          console.log("warning: no matching request found for openai response");
        }

        console.log("open api ai error", { e });
        // res();
        return;
      }
    });

  const throttle = (token_count: number) => {
    return new Promise(async (res) => {
      let _interval = setIntervalAsync(async () => {
        let tmp_tokens_requested_this_minute =
          token_count + tokens_requested_this_minute;
        let tmp_requests_made_this_minute = requests_made_this_minute + 1;
        let tmp_requests_made_this_interval =
          requests_made_this_time_interval + 1;
        if (
          tmp_tokens_requested_this_minute < MAX_TOKEN_COUNT_PER_MINUTE &&
          tmp_requests_made_this_minute < MAX_REQUESTS_PER_MINUTE &&
          tmp_requests_made_this_interval < MAX_REQUESTS_PER_TIME_INTERVAL
        ) {
          tokens_requested_this_minute = tmp_tokens_requested_this_minute;
          requests_made_this_minute += 1;
          requests_made_this_time_interval += 1;
          res(null);
          clearIntervalAsync(_interval);
        }
      }, 250);
    });
  };
  const init = () => {
    timerInterval = setInterval(() => {
      num_of_qs += 1;
      if (num_of_qs == 4) {
        num_of_qs = 0;
        num_of_sec += 1;
        requests_made_this_time_interval = 0;
      }
      if (num_of_sec == 60) {
        num_of_sec = 0;
        requests_made_this_minute = 0;
        requests_made_this_time_interval = 0;
        tokens_requested_this_minute = 0;
      }
    }, 250);

    // TODO: Might be better off using regular setInterval here
    readRequestQueue = setIntervalAsync(async () => {
      let reqObj = requestsQueue.shift();
      if (reqObj && !reqObj.finalized) {
        await throttle(reqObj.tokenCount);
        let p = [];
        try {
          p.push(makeOpenAICall(reqObj));
          Promise.allSettled(p);
        } catch (e) {}
      }
    }, 250);

    batcherInterval = setIntervalAsync(async () => {
      for (let k in queue) {
        if (queue[k].requests) {
          let isFinal = true;
          let isError = false;
          let results: RequestQueueItem[] = [];

          queue[k].requests.forEach((el) => {
            switch (el.status) {
              case RequestStatus.Success:
                results.push(el);
                break;
              case RequestStatus.Fail:
                isError = true;
                if (el.retryCount > 2) {
                  isFinal = true;
                } else {
                  el.retryCount += 1;
                }
                break;
              default:
                isFinal = false;
                break;
            }
          });
          if (isFinal) {
            if (isError) {
              emitter.emit("error", {
                id: k,
                prompts: queue[k].requests.map((r) => r.prompt),
              });
            } else {
              emitter.emit("data", { id: k, data: results });
              delete queue[k];
            }
          }
        }
      }
    }, 100);
  };

  return {
    init,
    addToQueue,
    clear,
    emitter,
  };
}
