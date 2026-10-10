window.DIAGRAM_CONTENT = {
  navixscribe: {
    title: "NavixScribe: clinical documentation from audio",
    summary: "NavixScribe turns a clinical encounter into structured notes, and it also verifies insurance benefits. It has three paths: recorded sessions that are transcribed and turned into notes, live dictation into the note, and a benefits-verification agent that reads payer responses. Click a node to see what I built or hardened at that stage, and why it was designed that way.",
    nodes: {
      audio: {
        title: "Session audio",
        tagline: "Capture in 5-second chunks so a failure costs seconds of audio instead of the whole session.",
        body: [
          "The browser records the encounter as 5-second PCM WAV chunks and uploads each one while recording continues. Small chunks keep the loss from any single failure small, and the server can start assembling audio before the session ends. With background transcription, the clinician can start the next session while the last one is still processing.",
          "On the server, the chunks are combined and the result is written to object storage with a direct in-memory PUT. That replaced a temp-file step that failed on the App Service's read-only filesystem. The fix removes the dependency on disk instead of adding a writable mount."
        ],
        points: [
          "5 s WAV chunks are uploaded continuously during capture",
          "The combined audio goes to S3 with no local temp file",
          "On read, ffprobe corrects the stored duration when it drifts by more than 0.1 s",
          "With background transcription, a clinician can start the next session while the last one is still processing"
        ],
        stack: ["React", "MobX", "Node.js", "AWS S3", "ffmpeg"]
      },
      upload: {
        title: "Chunk upload",
        tagline: "Failed chunks are saved in the browser and retried until they land.",
        body: [
          "Unreliable clinic Wi-Fi, mobile Safari pausing background tabs, or a page refresh used to drop a chunk for good. The gap showed up only when the clinician read the transcript. I built the client-side resilience layer, which sits on top of a chunk route a colleague wrote: any failed chunk is written to IndexedDB and retried with jittered exponential backoff.",
          "Every retry dimension has a limit: attempts, delay, concurrency and storage age. That way recovery cannot become a failure mode of its own, such as a retry storm on a weak connection. Five attempts with a 30-second cap ride out about a minute and a half of transient outage without hammering the server, and jitter keeps clients from retrying in sync."
        ],
        points: [
          "Backoff starts at 1 s, caps at 30 s, and adds 0.85x to 1.15x jitter",
          "Up to 5 attempts, with no more than 3 retries in flight",
          "Pending chunks are recovered on page load and re-queued on the browser's online event",
          "Chunks older than 24 hours are cleaned up"
        ],
        stack: ["IndexedDB", "JavaScript", "React"],
        nested: {
          caption: "What happens to a chunk when its upload fails",
          direction: "col",
          steps: [
            { label: "Upload attempt", sub: "The chunk is posted while recording continues" },
            { label: "Persist on failure", sub: "The chunk is written to IndexedDB, so a refresh or tab crash doesn't lose it" },
            { label: "Backoff retry", sub: "Delay runs from 1 s to 30 s with jitter, up to 5 attempts, 3 at a time" },
            { label: "Recover", sub: "Pending chunks are re-queued on page load or when the network comes back" },
            { label: "Expire", sub: "Chunks older than 24 h are cleared" }
          ]
        }
      },
      transcribe: {
        title: "Transcription",
        tagline: "Polling has a deadline, so a hung request can't leave a recording stuck in \"processing\".",
        body: [
          "A colleague built the queue-based transcription pipeline, and I hardened it. The worker polled the speech API with a retry counter. The HTTP client had no default timeout, so a single hung request never advanced the counter, and the recording stayed in \"processing\" while it held a worker slot.",
          "I wrapped every request in an abort timeout and replaced the counter with a wall-clock deadline. A timeout now raises a typed error and moves the job to a terminal state that the existing one-click retranscribe flow already handles. Most stalls now end within about two minutes, every stall ends within the hour, and freed worker slots stop back-to-back recordings from piling up."
        ],
        points: [
          "Each request has an abort timeout (120 s by default)",
          "Polling has a wall-clock deadline (1 h) and a 10 s interval",
          "A fault-injection harness with a fake speech server in healthy and stall modes reproduces the hang deterministically",
          "HTTP polling is a fallback, so a missed socket event no longer strands the UI"
        ],
        stack: ["BullMQ", "Redis", "AssemblyAI", "Socket.io", "Node.js"]
      },
      notegen: {
        title: "Note generation",
        tagline: "Note formats are encoded as versioned instructions, so output arrives already structured.",
        body: [
          "I led the note-generation frontend and built its LLM integration. SOAP, DAP, SIRP, BIRP, GIRP, H&P and group notes are each encoded as structured instructions. Specialty personas carry over between sessions, and teams can share custom templates. Group sessions produce a group summary and a note for each participant in one run.",
          "Later I moved the runtime from 15 portal-managed assistants to the OpenAI Responses API, behind a provider-agnostic RuntimeAdapter. The message envelope and ordering stayed the same, so neither the web app nor the downstream EMR needed any changes. Instructions moved out of portal configuration and into versioned code, so environments can no longer drift."
        ],
        points: [
          "Calls are stateless with store=false, and instructions are layered in one reviewed module",
          "Each thread is routed to the right runtime, so legacy threads keep resolving with no data migration",
          "A 157-test contract and regression suite gated the cutover",
          "Persisting provider context plus transcript-based recovery cut failed session reopens after restarts from 18 to 0, and recovered 12 broken sessions"
        ],
        stack: ["OpenAI Responses API", "Azure OpenAI", "Node.js", "MongoDB", "React"]
      },
      mic: {
        title: "Browser mic",
        tagline: "Audio goes straight from the browser to the speech API, without passing through the app server.",
        body: [
          "Dictation streams microphone audio from the browser directly to Deepgram over a WebSocket. Interim results and voice-activity events let the clinician see text while still speaking, and utterance segmentation and smart formatting clean up the final text. Since audio never touches the app server, dictation adds no CPU or connection load to the application.",
          "I tried WebRTC first. It was the wrong fit for this flow, so I replaced it with WebSocket the same day. Two earlier releases came before this design: one shipped a build-time key in the browser, and the other proxied all audio through the Node server over Socket.io."
        ],
        points: [
          "The WebSocket stream has interim_results, vad_events, utterances and smart_format enabled",
          "No audio passes through the app server, so the App Service holds no per-user audio connections",
          "The browser authenticates only with a short-lived token from the broker"
        ],
        stack: ["WebSocket", "JavaScript", "React"]
      },
      broker: {
        title: "Token broker",
        tagline: "Trust comes from a short-lived credential, not from routing audio through a proxy.",
        body: [
          "The first release shipped a speech-API key in the browser build. The second proxied all audio through the Node server, which kept the key secret but added a network hop, server CPU and per-connection state. The broker gets the security of the proxy with the speed of a direct connection.",
          "The endpoint is authenticated. It mints a scoped key that expires in minutes and returns the token with its expiry. A leaked token is useless almost immediately, and no long-lived key ever reaches the client. Logging is deliberately minimal: only the user id, TTL and scopes are recorded."
        ],
        points: [
          "Token TTL is clamped to 30 to 300 s, with a default of 120 s",
          "Rate limit is 30 requests per 5 minutes per caller",
          "Minting has two attempts: a TTL-scoped key first, then a realtime-connect key with an absolute expiry",
          "Logs record only user id, TTL and scopes, never the token"
        ],
        stack: ["Node.js", "Express", "Deepgram API"],
        nested: {
          caption: "How a token is minted and expires",
          direction: "row",
          steps: [
            { label: "Request", sub: "An authenticated client asks for a token" },
            { label: "Rate limit", sub: "30 per 5 min" },
            { label: "Mint", sub: "Scoped key with TTL clamped to 30-300 s, plus a fallback mint" },
            { label: "Return", sub: "{token, expiresAt}" },
            { label: "Connect", sub: "Browser opens the WebSocket directly" },
            { label: "Expire", sub: "Key stops working within minutes" }
          ]
        }
      },
      deepgram: {
        title: "Deepgram streaming STT",
        tagline: "Streaming speech-to-text on nova-3, with no proxy in the path.",
        body: [
          "Recognition runs on Deepgram nova-3 over a direct client connection. Dropping the server proxy takes out a round trip of roughly 100 ms, against a typical first-result time of about 280 ms, and removes audio handling from the application process entirely.",
          "The architecture went through three stages: a key in the browser, then a server proxy, then direct streaming with ephemeral credentials. Each stage fixed the main weakness of the one before it. The final design keeps the proxy's security benefit and drops its latency and server load."
        ],
        points: [
          "Model: nova-3 with real-time interim results",
          "The client-direct path removes the proxy round trip",
          "Voice-activity events mark the start and end of speech for the live display"
        ],
        stack: ["Deepgram nova-3", "WebSocket"]
      },
      note: {
        title: "Clinical note",
        tagline: "Dictated text goes straight into the note being edited.",
        body: [
          "Live text appears while the clinician speaks, and the final transcript is inserted into the note they are editing. Dictation becomes part of normal editing instead of a separate step that has to be copied over. Utterance segmentation and smart formatting keep the inserted text readable without manual cleanup.",
          "The note lives in the same session as the recorded encounter. Generated drafts, dictated additions and follow-up questions all share one thread, so the transcript never has to be uploaded again. Notes stay fully editable, so the clinician remains the final reviewer of everything the system produces."
        ],
        points: [
          "Interim results give live feedback, and final results are inserted into the note",
          "One session thread serves every downstream clinical action",
          "Notes stay editable, so the clinician is always the final reviewer"
        ],
        stack: ["React", "MobX"]
      },
      payer: {
        title: "Payer documents",
        tagline: "Large, messy eligibility responses are kept in a form the model can reason over.",
        body: [
          "I built the benefits-verification module alone. A direct electronic eligibility request replaces payer portals and phone calls, and a payer catalog removes the identifier errors that forced resubmissions. Eligibility responses are large and inconsistent, so the first assistant version split benefits into chunks that fit the model's context window.",
          "The LangGraph version passes the complete payer response into typed state, split into its structural parts. The model never works from a lossy pre-digested copy. Each part of the response has a predictable place in state. Staff see the same data in pre-structured tabs, so they review benefits instead of transcribing them."
        ],
        points: [
          "Electronic eligibility via Optum, with a payer catalog for identifier mapping",
          "Benefit chunking kept oversized responses within the context limit",
          "Typed state fields hold the raw benefits plus provider, subscriber, payer, plan and coverage details"
        ],
        stack: ["Node.js", "Optum eligibility", "MongoDB", "React", "MobX"]
      },
      vob: {
        title: "VOB agent",
        tagline: "A LangGraph conversation graph that summarizes a case on its own, then answers follow-up questions.",
        body: [
          "A new case thread routes to an initialize node. It builds the benefits context and writes the full admission summary without waiting for a question. Later messages go through topic analysis and an optional search step before the response is generated.",
          "Safety screening started as a separate gatekeeper model call that could refuse valid questions. I folded it into assessment rules inside the single response prompt. That cut model calls per follow-up from 2 to 1 and removed the hard-deny path, while keeping the safety, relevance and prompt-extraction checks."
        ],
        points: [
          "Low temperature (0.1) keeps the summary layout stable from case to case",
          "When the model call fails, the user gets a fallback reply instead of an exception",
          "Runs on LangGraph Platform with graphs registered by factory and prompts editable in Studio",
          "Retiring a custom 296-line FastAPI server put 3 graphs on 1 deployment"
        ],
        stack: ["Python", "LangGraph", "LangChain", "OpenAI", "Pydantic"],
        nested: {
          caption: "Graph topology",
          direction: "col",
          steps: [
            { label: "route_entry_point", sub: "A new thread goes to initialize; an existing thread goes to analysis" },
            { label: "initialize", sub: "Builds the benefits context and writes the 7-section summary" },
            { label: "analyze_message", sub: "Detects the topic: costs, mental health, providers or general" },
            { label: "should_search", sub: "Conditional edge to an optional search step" },
            { label: "generate_response", sub: "Rebuilds the context every turn and answers inside the guardrail rules" }
          ]
        }
      },
      memory: {
        title: "Case memory",
        tagline: "Each case always reopens to the same conversation.",
        body: [
          "Thread ids are derived deterministically with uuidv5 over the case id, and thread creation is idempotent. Reopening a case lands on the same checkpointed conversation, so staff never repeat context. It doesn't matter whether a case is reopened minutes or weeks later, because the state lives in the checkpointer and not in a process.",
          "The benefits context is rebuilt into the system prompt on every turn, and only the most recent non-system messages are sent. The model always reasons over current case data, and the prompt stays bounded however long the conversation runs. The full payer response stays in state the whole time."
        ],
        points: [
          "Deterministic uuidv5 thread ids, created with if_exists set to do nothing",
          "Durable state comes from the MongoDB checkpointer",
          "A window of the last 8 non-system messages, with the benefits context refreshed every turn"
        ],
        stack: ["LangGraph", "MongoDB", "uuidv5"]
      },
      brief: {
        title: "Admission brief",
        tagline: "A fixed 7-section summary that follows the admission decision staff actually make.",
        body: [
          "The summary has seven labeled sections: patient responsibility, service coverage by level of care, authorization requirements, plan type and network status, limitations and exclusions, effective dates and eligibility, and warnings. It ends with a Yes/No admission recommendation, a one-sentence justification and a confidence level.",
          "The prompt makes the model state its uncertainty instead of guessing. It may not assume the facility's network status, and it adds an explicit line saying further verification is needed when the data can't settle a question. If the payer response contains a JSON error, that gets its own section first."
        ],
        points: [
          "Covers deductibles, out-of-pocket maximums, copays and coinsurance, with remaining amounts",
          "Coverage for inpatient, RTC, PHP, IOP and outpatient levels of care",
          "Flags COB, TPA, carve-outs and missing fields as warnings",
          "Recommendation includes a High, Medium or Low confidence level"
        ],
        stack: ["LangGraph", "Prompt design"]
      }
    }
  },

  smartfill: {
    title: "SmartFill: multi-agent EMR form autofill",
    summary: "SmartFill fills long clinical and CRM forms from the patient's chart. A categorizer maps each field to the chart domains that can answer it. Domain agents then run in parallel within fixed concurrency and time budgets, and every field comes back either filled or explicitly flagged as uncertain. I architected the system and led it alongside colleagues.",
    nodes: {
      form: {
        title: "EMR form",
        tagline: "The clinician's form is both the input and the review surface.",
        body: [
          "Without SmartFill, a clinician fills a form by clicking through demographics, episodes, medications, labs, notes and incidents, then retyping and reformatting values. SmartFill starts from the form itself. Field labels are deduplicated with a two-pass count plus a section prefix, so every downstream model sees unique names.",
          "Results come back as proposals, not silent writes. A review store tracks each field as pending, accepted, declined or uncertain, and keeps a snapshot of the original form so a decline reverts cleanly. Each run's per-agent results are audited, so it is always possible to see which agent proposed which value."
        ],
        points: [
          "Fields are indexed by position, so the agent output contract stays compact",
          "Results stream per agent, so fields appear as each domain finishes",
          "Accept and decline review keeps the clinician as the decision-maker",
          "A 56-test web harness covers the field value applier"
        ],
        stack: ["React", "zustand", "Server-Sent Events"]
      },
      orchestrator: {
        title: "Orchestrator",
        tagline: "Plan which agents are needed, run them in parallel, and merge by field type.",
        body: [
          "One categorizer call maps every field to between one and three chart domains, and the orchestrator picks only the agents those domains need from a pool of 21. Agents fan out under bounded concurrency with per-agent and total time budgets. A failed agent settles as a failed result rather than ending the run, so total time is set by the slowest agent, not the sum of all of them.",
          "Merging follows the field type. Narrative fields get an LLM merge, which falls back to the longest value. Selects, dates, times and numbers follow domain priority. Checkboxes take the union. A formatter then handles dates, AM/PM times and multi-value options, and an \"Other\" choice stays consistent with its explanation text."
        ],
        points: [
          "Concurrency is capped at 15, with a 60 s budget per agent and 85 s for the whole run",
          "Up to 2 retries on transient status codes, all within the total budget",
          "One run-wide provider switch covers categorizer, fan-out and merge across OpenAI and Bedrock",
          "A 50-scenario scripted harness records every outbound prompt"
        ],
        stack: ["PHP", "Laravel", "OpenAI Responses API", "AWS Bedrock", "Guzzle"],
        nested: {
          caption: "Plan, fan-out, merge",
          direction: "row",
          steps: [
            { label: "Dedupe labels", sub: "Gives every field a unique name" },
            { label: "Categorize", sub: "One LLM call maps each field to 1-3 domains" },
            { label: "Select agents", sub: "Only the agents needed, out of 21" },
            { label: "Fan out", sub: "Up to 15 concurrent, 60 s per agent, 85 s total" },
            { label: "Merge", sub: "By field type: LLM for narrative, priority for structured, union for checkboxes" }
          ]
        }
      },
      chart: {
        title: "Chart retrieval",
        tagline: "Fetch only the chart domains the plan needs, and tokenize them before they leave the system.",
        body: [
          "Domain fetchers prefetch just the union of the domains the categorizer asked for, so agents get focused context instead of the whole chart. Same-template carry-forward finds the latest completed instance of the form within the treatment episode, so stable answers don't have to be entered again.",
          "Before any data leaves the system, every fetched domain is tokenized with one shared, reversible token map. Filled values are de-anonymized only after the merge. The only exception is a narrow one for identity fields, which go to a dedicated agent and are audit-logged. Model calls run with store=false, so the provider keeps no copy."
        ],
        points: [
          "Fetchers implement one shared interface, keyed by domain and scoped by episode date range",
          "Prior completed instances of the same template are scoped to the treatment episode",
          "Reversible PII tokenization uses one shared map per run",
          "Model calls run with store=false"
        ],
        stack: ["PHP", "Laravel", "MySQL"]
      },
      agentA: {
        title: "Field-group agent: demographics",
        tagline: "Identity and demographic fields come from structured data, so they fill almost deterministically.",
        body: [
          "Demographic and identity fields map to structured chart data, so this agent fills them almost deterministically. It is the one agent that needs real identifiers to do its job, so it has a narrow exemption from tokenization covering three identity domains, and every use writes an audit log line.",
          "Like every agent, it returns a fixed contract: filled fields keyed by index, plus an explicit list of fields it couldn't answer. A shared safety net adds any field assigned to the agent but missing from its output to that list, so an omission is never read as an empty answer."
        ],
        points: [
          "Output contract is {filledFields, uncertainFields}",
          "The identity exemption is limited to three domains and is audit-logged",
          "Formatting of dates, times and phone numbers is handled downstream by a dedicated formatter"
        ],
        stack: ["PHP", "LLM structured output"]
      },
      agentB: {
        title: "Field-group agent: clinical",
        tagline: "Clinical notes, medications and labs, each answered from its own domain.",
        body: [
          "Clinical fields are split across focused agents for clinical notes, group notes, medications and pharmacy, and labs. Each sees only its own domain's tokenized context, which keeps prompts small and answers grounded in the right source. Agents run concurrently, so a slow domain doesn't block the others.",
          "Narrative fields that several clinical agents answer are reconciled by an LLM merge, which falls back to the longest value if the merge fails. Structured clinical values use domain priority. Each agent is isolated, so a failure in one clinical domain flags only that domain's fields and the rest of the form still fills."
        ],
        points: [
          "Domain-scoped agents share one base class and one agent interface",
          "Placeholder answers such as unknown, n/a or tbd are treated as uncertain",
          "A failed agent streams a failed delta and the rest of the run continues"
        ],
        stack: ["PHP", "OpenAI Responses API", "Claude on Bedrock"]
      },
      agentC: {
        title: "Field-group agent: assessments",
        tagline: "Admission and assessment fields draw on episode data and earlier answers.",
        body: [
          "Assessment-style forms, such as admission assessments and treatment-plan reviews, mix episode facts with answers that rarely change between instances. Admission and dynamic-context agents answer from episode data, and carry-forward gives them the latest completed answers from the same template. Values that rarely change are proposed rather than retyped.",
          "Option-heavy fields go through lossless option matching. Matching was hardened after a substring tier collapsed multi-value answers into a single option. When the formatter rejects a value, the field is marked uncertain instead of being written with a value that matches no option."
        ],
        points: [
          "Carry-forward from earlier instances of the same template within the episode",
          "Option matching is aware of separators, so multi-select answers survive intact",
          "An \"Other\" choice and its explanation stay consistent, checked again after formatting"
        ],
        stack: ["PHP", "LLM structured output"]
      },
      validated: {
        title: "Validated fill",
        tagline: "Every field is either filled or explicitly flagged. Nothing is dropped silently.",
        body: [
          "Agent output must pass a usable-envelope check before it counts. On Bedrock, structured output is forced through a tool schema that requires filled and uncertain fields, and an empty or malformed envelope triggers a bounded retry. A rejected payload on the final retry is discarded rather than parsed as an empty fill.",
          "The rule against silently losing a field is enforced in three places: a safety net that marks assigned-but-missing fields as uncertain, formatter rejections, and failed-agent deltas. Uncertain fields are shown separately in review, so the clinician knows exactly which fields still need attention."
        ],
        points: [
          "Fills are identical across OpenAI and Bedrock on all 50 harness scenarios, checked by a deterministic parity test",
          "Placeholder detection on the backend is mirrored in the web applier",
          "Values are restored from PII tokens only after the merge",
          "Audit records keep per-agent results and truncated fetcher snapshots"
        ],
        stack: ["PHP", "JSON schema", "AWS Bedrock Converse", "PHPUnit"],
        nested: {
          caption: "From agent output to reviewable fill",
          direction: "col",
          steps: [
            { label: "Envelope gate", sub: "Rejects empty or list-shaped output and retries once within budget" },
            { label: "Uncertainty net", sub: "Placeholders and missing assigned fields become uncertain" },
            { label: "Type-aware merge", sub: "Resolves conflicts between agents" },
            { label: "Format and match", sub: "Dates, times and lossless option matching; rejections become uncertain" },
            { label: "Restore PII", sub: "De-anonymizes values from the shared token map" },
            { label: "Review", sub: "Streamed to the clinician to accept or decline" }
          ]
        }
      }
    }
  },

  monee: {
    title: "AI support pipeline: helpdesk to reply",
    summary: "An event-driven pipeline that answers shopper email for many merchant storefronts. Every inbound message becomes a turn in a DynamoDB state machine with compare-and-set transitions. A pure policy engine decides whether each draft is emailed, held for a human, or kept as an internal note. I was the primary engineer, responsible for the architecture, the production cutover, CI and observability.",
    nodes: {
      webhook: {
        title: "Helpdesk webhook",
        tagline: "One inbound customer message mints exactly one turn.",
        body: [
          "The helpdesk posts every ticket-created and ticket-updated event to a single ingress. Webhooks are delivered at least once and often duplicated, so turn minting is a compare-and-set on a per-conversation head item that tracks message ids already seen. Duplicates are dropped before a turn exists.",
          "This replaced two parallel planes, one for initial tickets and one for follow-ups. Each had its own endpoint, generator, dispatcher and queue, and their prompt and gate stacks had drifted apart. Every safety or prompt change had to be made and verified twice, and a reply that arrived while a draft was pending could be handled by both planes."
        ],
        points: [
          "The turn allocator fails closed",
          "Notification-sender tickets are declined at ingress",
          "The conversation context item is upserted on every event"
        ],
        stack: ["Go", "AWS Lambda", "DynamoDB"]
      },
      apigw: {
        title: "API Gateway",
        tagline: "Go on Lambda, with stateless handlers and all state in DynamoDB.",
        body: [
          "API Gateway invokes Go Lambdas on the custom provided.al2 runtime. The handlers stay stateless: they validate the request, write state to DynamoDB, and let the stream drive everything after that. Generation, decisions and sending all happen downstream, each triggered by a state change rather than a direct call.",
          "The turn stack was deployed through direct API calls derived from the infrastructure template, because the live functions had drifted from it. Code updates leave environment configuration untouched, and a matching teardown exists. Stream mappings were created disabled and switched on only at cutover."
        ],
        points: [
          "Request validation at the edge, before any state is written",
          "Fixed function names and code-only updates keep live configuration stable",
          "A LocalStack integration suite covers DynamoDB, Kinesis, SQS, S3 and Secrets Manager in CI"
        ],
        stack: ["AWS API Gateway", "Go", "AWS Lambda", "SAM", "GitLab CI"]
      },
      streams: {
        title: "DynamoDB Streams + SQS fan-out",
        tagline: "The table's stream is the event bus, and each stage wakes only for its own state.",
        body: [
          "One table holds per-ticket context items plus head and turn items for the state machine, and its stream acts as the event bus. Each Lambda's event-source mapping filters on exactly one state. Golden tests pin those filters, so a template edit can't silently re-route traffic.",
          "Poison-pill guards, record-age limits and 8 capped retries send exhausted records to alarmed dead-letter queues, so one bad record can't stall a shard. Sends are queued on SQS with a random 8 to 15 minute delay. Because each stage filters for its own state, throughput scales stage by stage."
        ],
        points: [
          "Hardening the enricher after cutover cut stream lag (IteratorAge) from 156 s to about 1.2 s",
          "A size guard keeps context items under DynamoDB's 400 KB item limit",
          "About 15 seconds from ticket receipt to send decision, most of it spent on generation",
          "A reaper sweeps stuck turns every 5 minutes"
        ],
        stack: ["DynamoDB Streams", "AWS SQS", "EventBridge", "CloudWatch"]
      },
      turn: {
        title: "Turn state machine",
        tagline: "Every transition is a conditional write, so concurrent workers can't advance a turn twice.",
        body: [
          "Each turn moves through a fixed set of states, and every transition is a conditional UpdateItem. Four Lambdas own the stages: enricher, generator, and an executor with separate decide and send legs. The generator writes the draft and the DRAFTED state in a single conditional write.",
          "The send leg claims a 90-second lease. That window is chosen to sit between the 60 s Lambda timeout and the 120 s queue visibility timeout, so a crashed send can be claimed again when the message is redelivered. A lease that is still live blocks a second worker, and an expired one lets recovery go ahead."
        ],
        points: [
          "Compare-and-set on every transition",
          "Under the lease, the send leg re-checks for a newer turn that supersedes this one",
          "Old dispatch flags are written back, so analytics keep working and a rollback can't send twice",
          "The cutover was aborted within about 10 minutes, root-caused, and re-cut the same day"
        ],
        stack: ["Go", "DynamoDB", "AWS SQS", "AWS Lambda"],
        nested: {
          caption: "Turn lifecycle",
          direction: "row",
          steps: [
            { label: "RECEIVED", sub: "Minted once per inbound message" },
            { label: "CLASSIFIED", sub: "Category, cleaned text and language" },
            { label: "ENRICHED", sub: "Order lookup is done; follow-ups enter here" },
            { label: "DRAFTED", sub: "Validated draft stored atomically" },
            { label: "DECIDED", sub: "Policy decision recorded" },
            { label: "SENT / NOTED", sub: "Email or internal note; SKIPPED is the exit" }
          ]
        }
      },
      claude: {
        title: "Claude + RAG on Databricks",
        tagline: "Claude makes one validated call over retrieved SOPs, with a prompt prefix that stays cache-stable.",
        body: [
          "The generator retrieves SOP chunks from a Databricks Vector Search index, filtered by stage and topic, then makes one validated call to Claude on the pay-per-token Foundation Model API. Sonnet generates replies and Haiku preprocesses tickets. The preprocessor model classifies language first, and statistical detectors only fill gaps.",
          "Prompts are split into byte-identical global prefixes behind cache breakpoints, followed by an uncached tail for each ticket. A CI guard test fails the build if a prefix ever becomes per-request. The pooled prompt-cache hit rate is 92.7%, so most input tokens are billed at the cache-read rate."
        ],
        points: [
          "The SOP corpus is split on headings into a Delta Sync index, with a corpus fingerprint pinned in CI",
          "A freshness job every 2 hours compares indexed rows against the source table",
          "A failed draft gets one corrective retry, appended to the uncached tail only",
          "Loading language models at init instead of on the request path cut worst-case generator memory by 93%, from 1,305 MB to 91 MB"
        ],
        stack: ["Claude Sonnet", "Claude Haiku", "Databricks Vector Search", "Python", "Go"]
      },
      policy: {
        title: "Policy gate",
        tagline: "A pure, versioned decision engine in which hard safety floors always win.",
        body: [
          "The decision is a pure function of the turn context, the draft and a versioned policy snapshot, with no I/O. Hard gates run first: kill switch, readiness, spam, skip classes, multilingual legal and fraud escalation, and deferral. Soft gates run only when every hard gate abstains. Before it replaced the legacy dispatchers, the engine ran in shadow and matched them on all 7,323 production decisions, with 0 mismatches.",
          "Within that engine, a reply goes out as live email only when all six conditions below hold. Anything that fails a condition becomes an internal note for a human agent rather than an email. Uncertainty turns into a handoff, never into a bad reply or silence."
        ],
        points: [
          "Every decision is recorded with a gate-by-gate trace, and PII is scrubbed",
          "Safety gates for receipt claims, payment scope and authority correspondence each run in off, shadow or enforce mode",
          "Gates are promoted on backtest evidence, such as a 1,000-ticket production backtest",
          "Versioned snapshots let any decision be replayed against the exact policy that produced it"
        ],
        stack: ["Go", "DynamoDB", "CloudWatch EMF"],
        nested: {
          caption: "The six-condition live-send check",
          direction: "col",
          steps: [
            { label: "Kill switch on", sub: "Live sending is enabled" },
            { label: "Not deferred", sub: "The generator did not hand off" },
            { label: "No review flag", sub: "Validators did not request human review" },
            { label: "Confidence >= 0.7", sub: "The draft clears the confidence floor" },
            { label: "Topic allow-listed", sub: "The topic is approved for live replies" },
            { label: "Eligible stage", sub: "The conversation stage allows live email" }
          ]
        }
      },
      reply: {
        title: "Reply or handoff",
        tagline: "When the system is unsure, a human agent handles it: no silence and no bad email.",
        body: [
          "A decided turn is either posted as a live customer email or written as an internal note for a human agent. Posting is idempotent. Each message carries a key built from the conversation, the turn and a draft-hash prefix, and that key is re-checked before any retry.",
          "Redelivery is handled by an atomic claim: a dispatch token is stamped before the message is enqueued, then the send claims, posts and commits. A message-id formatting bug had silently disabled dedup, and fixing it closed that duplicate-send path. If a send is stranded partway through, the reaper picks it up."
        ],
        points: [
          "Idempotency keys on every outbound post",
          "Per-schedule claims plus message-id dedup under at-least-once delivery",
          "Drafts that need review are held as internal notes",
          "Sent replies are kept as cross-turn memory for later messages in the thread"
        ],
        stack: ["Go", "Helpdesk REST API", "DynamoDB", "AWS SQS"]
      },
      replay: {
        title: "Replay harness",
        tagline: "Unit tests can't validate a prompt change, so recorded traffic gates every model-side deploy.",
        body: [
          "There is no staging serving endpoint, and a single LLM sample is noisy. The harness captures real payloads, replays them against production or against prompts in the working tree, and asserts behavior at the field level. Each case declares its own sample count and k-of-n pass threshold, so noise isn't mistaken for a regression.",
          "On the Go side, LLM cassettes and a helpdesk VCR keep tests hermetic, and a backtest engine replays production traffic. Replay covers prompts and notebooks only, not Go decision code, which has its own golden tests. Checks that need no credentials run on every push, and the credentialed judge evaluation is a manual gate on judge changes."
        ],
        points: [
          "A 148-case corpus gates every prompt, corpus and notebook deploy",
          "Judge gates: send precision 0.97, recall 0.60, per-language precision 0.95, stability 0.99",
          "Credentials are stripped from captured payloads, which closed a failure class that had looked like intermittent auth errors",
          "Thresholds without enough samples are rejected, and results that are too thin are reported as INCONCLUSIVE"
        ],
        stack: ["Python", "Go", "GitLab CI", "AWS S3", "CloudWatch Logs Insights"],
        nested: {
          caption: "Cassette replay flow",
          direction: "row",
          steps: [
            { label: "Capture", sub: "Verbatim payload from logs or S3" },
            { label: "Scrub", sub: "Credentials and PII removed" },
            { label: "Replay", sub: "Against production or working-tree prompts" },
            { label: "Sample", sub: "n runs per case" },
            { label: "Assert", sub: "k-of-n threshold per field" },
            { label: "Gate", sub: "A red case blocks the deploy" }
          ]
        }
      }
    }
  }
};
