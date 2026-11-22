import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/api";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "overview", title: "Overview" },
  { id: "auth", title: "Authentication" },
  { id: "rate-limit", title: "Rate limit" },
  { id: "errors", title: "Errors" },
  { id: "routes", title: "Routes" },
  { id: "whoami", title: "GET /whoami", level: 3 },
  { id: "create-run", title: "POST /runs", level: 3 },
  { id: "add-condition", title: "POST /runs/{id}/conditions", level: 3 },
  { id: "artifacts", title: "POST /runs/{id}/artifacts", level: 3 },
  { id: "complete-run", title: "POST /runs/{id}/complete", level: 3 },
  { id: "baseline", title: "GET /baseline", level: 3 },
  { id: "real-trials", title: "POST /real-trials", level: 3 },
  { id: "release", title: "GET /release", level: 3 },
  { id: "field-episodes", title: "POST /field/episodes", level: 3 },
  { id: "order", title: "Uploading a run, in order" },
];

const authExample = `curl -H "Authorization: Bearer $SHAKEDOWN_API_KEY" "$SHAKEDOWN_URL/api/v1/whoami"`;

const errorBody = `{ "error": "Missing API key. Send it as: Authorization: Bearer <key>" }`;

const whoami = `{
  "project": "transfer-cube",
  "project_name": "Transfer cube",
  "org": "acme"
}`;

const runHeader = `{
  "id": "6f1c0c1e-3a57-4a59-9a0e-2f4d0f6f7b11",
  "schema": 1,
  "engine_version": "0.1.0",
  "suite": "aloha-transfer-cube",
  "policy": {
    "label": "v2",
    "spec": "lerobot:lerobot/act_aloha_sim_transfer_cube_human?n_action_steps=50",
    "info": { "kind": "lerobot", "type": "act", "device": "cuda" }
  },
  "git": { "sha": "9c1d2e4", "branch": "main", "message": "Retrain on cleaned data", "dirty": false },
  "host": { "platform": "Linux-6.8", "python": "3.11.9", "machine": "x86_64" },
  "started_at": "2026-03-01T10:15:00+00:00",
  "baseline": { "run_id": "0b1f6c1e-8a57-4a59-9a0e-2f4d0f6f7b22", "label": "v1" },
  "planned": [
    { "key": "nominal", "label": "nominal", "scenario": "nominal", "episodes": 50 }
  ]
}`;

const runCreated = `{
  "run_id": "6f1c0c1e-3a57-4a59-9a0e-2f4d0f6f7b11",
  "number": 42,
  "url": "https://shakedown.example.com/app/acme/transfer-cube/runs/42"
}`;

const conditionStored = `{ "condition_id": "3d0a7f52-51c6-4a0b-9d0c-7a1f4b1f0c55", "episodes": 50 }`;

const artifactsRequest = `{
  "paths": [
    "episodes/camera-pan_4/1003.json",
    "episodes/camera-pan_4/1003.mp4"
  ]
}`;

const artifactsResponse = `{
  "uploads": [
    { "path": "episodes/camera-pan_4/1003.json", "url": "https://..." },
    { "path": "episodes/camera-pan_4/1003.mp4", "url": "https://..." }
  ]
}`;

const putFile = `curl -X PUT "<url>" \\
  -H "Content-Type: video/mp4" \\
  -H "x-upsert: true" \\
  --data-binary @runs/v2/episodes/camera-pan_4/1003.mp4`;

const footer = `{
  "finished_at": "2026-03-01T10:45:40+00:00",
  "duration_s": 1840.2,
  "verdict": "FAIL",
  "summary": { "conditions": 19, "pass": 16, "warn": 2, "fail": 1, "episodes": 950 }
}`;

const baselineResponse = `{
  "result": {
    "schema": 1,
    "id": "0b1f6c1e-8a57-4a59-9a0e-2f4d0f6f7b22",
    "number": 41,
    "suite": "aloha-transfer-cube",
    "policy": { "label": "v1" },
    "conditions": [
      {
        "key": "nominal",
        "fingerprint": "86668bfffa19e9de",
        "outcomes": { "1000": true, "1001": false }
      }
    ]
  }
}`;

const realTrials = `{
  "suite": "aloha-transfer-cube",
  "policy_label": "v2",
  "robot": "aloha-01",
  "trials": [
    {
      "condition_key": "nominal",
      "trial": 0,
      "success": true,
      "operator": "rk",
      "notes": "",
      "recorded_at": "2026-03-02T09:14:05+00:00"
    }
  ]
}`;

const releaseResponse = `{
  "channel": "fleet",
  "release": {
    "number": 7,
    "stage": "fleet",
    "policy_label": "act-chunk50",
    "policy_spec": "lerobot:lerobot/act_aloha_sim_transfer_cube_human?n_action_steps=50",
    "runtime_config": { "n_action_steps": 50 },
    "stage_changed_at": "2026-03-04T14:02:11+00:00"
  }
}`;

const fieldRequest = `{
  "episodes": [
    {
      "id": "0f3c2a9e6b7d4e1f8a5b9c2d7e4f1a3b",
      "policy_label": "act-chunk50",
      "release": 7,
      "robot": "arm-03",
      "site": "line-2",
      "success": false,
      "intervention": true,
      "intervention_reason": "cube slipped during handover",
      "note": "",
      "steps": 312,
      "duration_s": 6.41,
      "measured": {
        "inference_ms": 38.2,
        "action_delay_ms": 85.0,
        "control_hz": 50,
        "image_brightness": 96.4,
        "frames_dropped": 3
      },
      "simulated": false,
      "started_at": "2026-03-05T08:30:12+00:00"
    }
  ]
}`;

const fieldResponse = `{ "stored": 1, "new_suggestions": 0 }`;

export default function ApiPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="The HTTP API is what the CLI and the field SDK use to write to a Shakedown server. It has nine routes under /api/v1. Use it directly when you cannot use either, for example from a robot that does not run Python."
    >
      <H2 id="overview">Overview</H2>
      <UL>
        <LI>
          The base URL is your server’s URL followed by <C>/api/v1</C>. There is no default
          server: the examples use <C>$SHAKEDOWN_URL</C>.
        </LI>
        <LI>Request and response bodies are JSON. Times are ISO 8601 with an offset.</LI>
        <LI>A request body may be at most 8 MB.</LI>
        <LI>
          Unknown fields in a request body are ignored. Missing required fields and values
          outside the stated limits are answered with status 400.
        </LI>
        <LI>
          Every route writes to, or reads from, the one project the key belongs to. No route
          takes a project as a parameter.
        </LI>
      </UL>
      <P>
        The values in the examples are illustrative. The routes that the dashboard itself
        uses, outside <C>/api/v1</C>, work with a signed-in session and are not part of this
        API.
      </P>

      <H2 id="auth">Authentication</H2>
      <P>
        Send a project API key as a bearer token with every request. Keys start with{" "}
        <C>shk_</C> and are created in the project’s settings. See{" "}
        <A href="/docs/dashboard#api-keys">API keys</A>.
      </P>
      <CodeBlock lang="shell" code={authExample} />
      <DocTable
        caption="Authentication failures"
        head={["Status", "Message", "Cause"]}
        numeric={[0]}
        rows={[
          ["401", "Missing API key. Send it as: Authorization: Bearer <key>", "No header, or not a bearer token."],
          ["401", "That does not look like a Shakedown API key.", "The token does not start with shk_."],
          ["401", "Unknown API key.", "No key with that value exists."],
          ["401", "This API key has been revoked.", "The key was revoked in the settings."],
        ]}
      />
      <P>A key gives full write access to its project through this API. There are no scopes.</P>

      <H2 id="rate-limit">Rate limit</H2>
      <P>
        Each key may make <C>1200</C> requests per minute. The count is kept per key, over
        all routes, in fixed windows of 60 seconds that start on the minute.
      </P>
      <UL>
        <LI>
          A request over the limit is answered with status 429 and the message “Too many
          requests with this key. Wait a minute and try again.” No <C>Retry-After</C> header
          is sent. Wait for the next minute.
        </LI>
        <LI>A refused request counts towards the limit too.</LI>
        <LI>
          If the server cannot count, it lets the request through. Do not rely on the limit
          as a guarantee.
        </LI>
        <LI>
          Batch where a route allows it: up to 1,000 field reports or 5,000 real trials per
          request. The CLI and the SDK do.
        </LI>
      </UL>

      <H2 id="errors">Errors</H2>
      <P>
        An error is answered with a JSON body that has one field, <C>error</C>, holding a
        sentence meant for a person.
      </P>
      <CodeBlock lang="json" code={errorBody} />
      <DocTable
        caption="Status codes"
        head={["Status", "Meaning"]}
        numeric={[0]}
        rows={[
          ["200", "Success."],
          ["201", "Success, and something was stored."],
          ["400", "The body is not valid JSON, or a field is missing or out of range. The message names the field."],
          ["401", "The key is missing, unknown or revoked."],
          ["404", "The run does not exist or belongs to another project."],
          ["409", "The request conflicts with the state of the run."],
          ["413", "The body is larger than 8 MB."],
          ["429", "The rate limit was exceeded."],
          ["500", "The server failed. The request can be retried."],
        ]}
      />

      <H2 id="routes">Routes</H2>
      <DocTable
        caption="Routes of the API"
        head={["Route", "Purpose"]}
        rows={[
          ["GET /whoami", "The project a key belongs to."],
          ["POST /runs", "Create a run, or reopen it."],
          ["POST /runs/{id}/conditions", "Store the result of one condition."],
          ["POST /runs/{id}/artifacts", "Get upload URLs for traces and videos."],
          ["POST /runs/{id}/complete", "Mark a run as finished."],
          ["GET /baseline", "The latest completed run of a suite, as a baseline."],
          ["POST /real-trials", "Store trials made on a real robot."],
          ["GET /release", "The release a channel should run."],
          ["POST /field/episodes", "Store attempts reported by robots."],
        ]}
      />

      <H3 id="whoami" mono>
        GET /whoami
      </H3>
      <P>Returns the project and organization of the key. Use it to check a key.</P>
      <CodeBlock lang="json" filename="Response 200" code={whoami} />
      <P>
        <C>project</C> and <C>org</C> are the short names used in URLs.
      </P>

      <H3 id="create-run" mono>
        POST /runs
      </H3>
      <P>Creates a run in the state running. Conditions are added afterwards.</P>
      <CodeBlock lang="json" filename="Request" code={runHeader} />
      <DocTable
        caption="Fields of the POST /runs request"
        head={["Field", "Type", "Required", "Meaning"]}
        rows={[
          ["id", "UUID", "no", "Id of the run. The server chooses one when it is left out."],
          ["schema", "integer", "yes", "Must be 1."],
          ["engine_version", "string, up to 40", "yes", "Version of the engine that made the run."],
          ["suite", "string, 1 to 120", "yes", "Name of the suite. Baselines are looked up by it."],
          ["policy.label", "string, 1 to 120", "yes", "Name of the policy version."],
          ["policy.spec", "string, up to 500", "no", "The policy spec."],
          ["policy.info", "object", "no", "Anything that describes the policy."],
          [
            "git",
            "object",
            "no",
            "sha, branch, message, dirty, repository and pull_request. All optional.",
          ],
          ["host", "object", "no", "Anything that describes the machine."],
          ["started_at", "time", "yes", "When the run started."],
          [
            "baseline",
            "object or null",
            "no",
            "run_id and label of the baseline. The run is linked only when it is in the same project.",
          ],
          [
            "planned",
            "list, up to 2000",
            "no",
            "The conditions the run will contain: key, label, scenario and episodes. Lets the dashboard show progress.",
          ],
        ]}
      />
      <CodeBlock lang="json" filename="Response 201" code={runCreated} />
      <UL>
        <LI>
          <C>number</C> counts the runs of the project. <C>url</C> is the run’s page in the
          dashboard.
        </LI>
        <LI>
          When a run with the given id already exists in the same project, it is reopened:
          its state becomes running again, its planned conditions are replaced, and the
          answer has status 200. Conditions and files sent afterwards replace the stored
          ones.
        </LI>
        <LI>When the id exists in another project, the answer is status 409.</LI>
      </UL>

      <H3 id="add-condition" mono>
        {"POST /runs/{id}/conditions"}
      </H3>
      <P>
        Stores one condition with a summary of each of its episodes. The body is one element
        of <C>conditions</C> in <C>result.json</C>, as the engine writes it. The fields are
        described in the <A href="/docs/dashboard#what-is-uploaded">Dashboard</A> page.
      </P>
      <DocTable
        caption="Limits of the condition body"
        head={["Field", "Limit"]}
        rows={[
          ["key, scenario", "1 to 200 characters"],
          ["label", "1 to 300 characters"],
          ["description", "up to 2,000 characters"],
          ["fingerprint", "up to 64 characters"],
          ["tags", "up to 30, each up to 60 characters"],
          ["perturbations", "up to 50"],
          ["checks", "up to 20, each message up to 1,000 characters"],
          ["success_rate, ci_low, ci_high", "0 to 1"],
          ["verdict", "PASS, WARN, FAIL, SKIP or ERROR"],
          ["scenario_source", "up to 20,000 characters"],
          ["episodes_detail", "up to 100,000 episodes"],
        ]}
      />
      <CodeBlock lang="json" filename="Response 201" code={conditionStored} />
      <UL>
        <LI>
          A condition is identified by its key within the run. Sending the same key again
          replaces the condition and its episodes.
        </LI>
        <LI>
          The run must be running. For a run that was completed, the answer is status 409:
          reopen it with <C>POST /runs</C> first.
        </LI>
        <LI>
          The paths in <C>video</C> and <C>trace</C> of each episode are stored only when
          they have the form described under the next route.
        </LI>
      </UL>

      <H3 id="artifacts" mono>
        {"POST /runs/{id}/artifacts"}
      </H3>
      <P>
        Returns a signed upload URL for each file. The files themselves do not pass through
        the API: send each one to its URL with a <C>PUT</C> request.
      </P>
      <CodeBlock lang="json" filename="Request" code={artifactsRequest} />
      <CodeBlock lang="json" filename="Response 200" code={artifactsResponse} />
      <CodeBlock lang="shell" filename="Uploading one file" code={putFile} />
      <UL>
        <LI>1 to 100 paths per request.</LI>
        <LI>
          A path must have the form{" "}
          <C>episodes/&lt;condition&gt;/&lt;seed&gt;.json</C> or <C>.mp4</C>, where the
          condition consists of letters, digits, <C>.</C>, <C>_</C>, <C>@</C> and{" "}
          <C>-</C>, and the seed of up to 12 digits. Any other path is answered with status
          400. This keeps one run from writing into the folder of another.
        </LI>
        <LI>
          The URLs are short-lived and each is valid for its one path. The API key is not
          sent to storage.
        </LI>
        <LI>Uploading to the same path again replaces the file.</LI>
      </UL>

      <H3 id="complete-run" mono>
        {"POST /runs/{id}/complete"}
      </H3>
      <P>Marks the run as finished and stores its verdict.</P>
      <CodeBlock lang="json" filename="Request" code={footer} />
      <DocTable
        caption="Fields of the complete request"
        head={["Field", "Type", "Required", "Meaning"]}
        rows={[
          ["finished_at", "time", "yes", "When the run ended."],
          ["duration_s", "number, 0 or more", "yes", "Duration in seconds."],
          ["verdict", "PASS, WARN, FAIL, SKIP or ERROR", "yes", "Verdict of the run."],
          ["summary", "object", "no", "The summary of result.json."],
        ]}
      />
      <P>
        The response has status 200 and the same body as <C>POST /runs</C>. A run with the
        verdict ERROR is stored as failed, all others as completed. Only completed runs serve
        as baselines and can become releases.
      </P>

      <H3 id="baseline" mono>
        GET /baseline
      </H3>
      <DocTable
        caption="Query parameters of GET /baseline"
        head={["Parameter", "Required", "Meaning"]}
        rows={[
          ["suite", "yes", "Name of the suite."],
          ["branch", "no", "Only runs whose git branch is this one."],
        ]}
      />
      <P>
        Returns the latest completed run of the suite in the project, by start time, in the
        shape the engine reads as a baseline: for each condition its key, fingerprint and
        per-seed outcomes.
      </P>
      <CodeBlock lang="json" filename="Response 200" code={baselineResponse} />
      <P>
        When no run matches, the answer is status 200 with <C>{'{ "result": null }'}</C>.
      </P>

      <H3 id="real-trials" mono>
        POST /real-trials
      </H3>
      <P>
        Stores trials made on a real robot, as recorded by{" "}
        <A href="/docs/sim-to-real">shakedown real record</A>. One request holds the trials
        of one suite, one policy label and one robot.
      </P>
      <CodeBlock lang="json" filename="Request" code={realTrials} />
      <DocTable
        caption="Fields of the POST /real-trials request"
        head={["Field", "Type", "Required", "Meaning"]}
        rows={[
          ["suite", "string, 1 to 120", "yes", "Name of the suite."],
          ["policy_label", "string, 1 to 120", "yes", "Label of the policy."],
          ["robot", "string, up to 120", "no", "Name of the robot. Empty by default."],
          ["trials", "list, 1 to 5,000", "yes", "The trials."],
          ["trials[].condition_key", "string, 1 to 200", "yes", "Key of the condition."],
          ["trials[].trial", "integer, 0 or more", "yes", "Index of the trial within its condition."],
          ["trials[].success", "boolean", "yes", "Whether the trial succeeded."],
          ["trials[].operator", "string, up to 120", "no", "Who ran it."],
          ["trials[].notes", "string, up to 2,000", "no", "What went wrong."],
          ["trials[].recorded_at", "time", "no", "When it was recorded. Now, when left out."],
        ]}
      />
      <P>
        The response has status 201 and the body <C>{'{ "stored": 1 }'}</C>. A trial is
        identified by suite, condition key, policy label, robot and trial number. Sending it
        again replaces it.
      </P>

      <H3 id="release" mono>
        GET /release
      </H3>
      <DocTable
        caption="Query parameters of GET /release"
        head={["Parameter", "Required", "Meaning"]}
        rows={[["channel", "no", "fleet or canary. fleet by default. Anything else is answered with status 400."]]}
      />
      <CodeBlock lang="json" filename="Response 200" code={releaseResponse} />
      <P>
        The canary channel answers with the canary release, or with the fleet release when
        there is no canary. When the channel has no release, the answer is status 200 with{" "}
        <C>{'"release": null'}</C>. See <A href="/docs/releases#robot">Releases and gates</A>.
      </P>

      <H3 id="field-episodes" mono>
        POST /field/episodes
      </H3>
      <P>
        Stores attempts reported by robots. See <A href="/docs/field">Field reporting</A>.
      </P>
      <CodeBlock lang="json" filename="Request" code={fieldRequest} />
      <DocTable
        caption="Fields of one reported episode"
        head={["Field", "Type", "Required", "Meaning"]}
        rows={[
          ["id", "string, 1 to 120", "yes", "Chosen by the reporter. One report is stored per id within the project."],
          ["policy_label", "string, 1 to 120", "yes", "Label of the policy that ran."],
          ["release", "integer, 1 or more, or null", "no", "Number of the release that ran."],
          ["robot", "string, up to 120", "no", "Name of the robot."],
          ["site", "string, up to 120", "no", "Where the robot is."],
          ["success", "boolean", "yes", "Whether the attempt succeeded."],
          ["intervention", "boolean", "no", "A person stepped in. False by default."],
          ["intervention_reason", "string, up to 500", "no", "Why."],
          ["note", "string, up to 2,000", "no", "Free text."],
          ["steps", "integer, 0 or more", "no", "Control steps of the attempt."],
          ["duration_s", "number, 0 or more", "no", "Duration in seconds."],
          ["measured.inference_ms", "number, 0 or more", "no", "Median time of a policy call."],
          ["measured.action_delay_ms", "number, 0 or more", "no", "Delay between choosing an action and the robot acting on it."],
          ["measured.control_hz", "number above 0", "no", "Control rate."],
          ["measured.image_brightness", "number, 0 to 255", "no", "Mean pixel value."],
          ["measured.frames_dropped", "integer, 0 or more", "no", "Camera frames that did not arrive."],
          ["simulated", "boolean", "no", "The report comes from a stand-in, not from hardware. False by default."],
          ["started_at", "time", "no", "When the attempt started. Now, when left out."],
        ]}
      />
      <CodeBlock lang="json" filename="Response 201" code={fieldResponse} />
      <UL>
        <LI>1 to 1,000 episodes per request.</LI>
        <LI>
          When any episode names a release number that the project does not have, the whole
          request is answered with status 400 and nothing is stored.
        </LI>
        <LI>
          <C>new_suggestions</C> is the number of proposed tests that this request led to.
        </LI>
        <LI>Sending an episode with the same id again replaces the stored one.</LI>
      </UL>

      <H2 id="order">Uploading a run, in order</H2>
      <P>This is what <C>shakedown upload</C> does.</P>
      <DocTable
        caption="Requests that upload a run"
        head={["Step", "Request", "Repeated"]}
        numeric={[0]}
        monoFirst={false}
        rows={[
          ["1", <C key="r">POST /runs</C>, "once"],
          ["2", <C key="r">POST /runs/{"{id}"}/conditions</C>, "for each condition"],
          [
            "3",
            <C key="r">POST /runs/{"{id}"}/artifacts</C>,
            "for each condition, in batches of 50 paths",
          ],
          ["4", <>A <C>PUT</C> to each signed URL</>, "for each file"],
          ["5", <C key="r">POST /runs/{"{id}"}/complete</C>, "once"],
        ]}
      />
      <Callout title="Every step can be repeated">
        <p>
          Runs, conditions, files, trials and field reports are all stored by identity, so a
          request that is sent again after a failure replaces what it stored and duplicates
          nothing. To resume an upload that was interrupted, start again from step 1 with
          the same run id.
        </p>
      </Callout>
    </DocPage>
  );
}
