/*
Copyright 2022 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const { randomUUID } = require("crypto");
const axios = require("axios");
const buildRequestBody = require("./buildRequestBody");

const app = express();
const port = 3000

const pageContents = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

app.use(cookieParser());

app.get("/alloy.min.js", (req, res) => {
  // This is built from https://github.com/adobe/alloy/pull/880
  // which supports using the cluster cookie
  res.sendFile(path.join(__dirname, "alloy.min.js"));
})

app.get("/", async (req, res) => {
  // Create or read an FPID from cookies
  const FPID = req.cookies.myidcookie || randomUUID();
  res.cookie("myidcookie", FPID, { maxAge: 1000 * 60 * 60 * 24 * 365 });

  // Get the kndctr cookies from the request and pass to experience edge
  const cookieHeader = Object.keys(req.cookies)
    .filter(cookieName => cookieName.startsWith("kndctr_97D1F3F459CE0AD80A495CBE_AdobeOrg_"))
    .map(cookieName => `${cookieName}=${req.cookies[cookieName]};`)
    .join(" ");

  // Get the cluster from the request so that it can be added to the URL
  const currentCluster = req.cookies["kndctr_97D1F3F459CE0AD80A495CBE_AdobeOrg_cluster"];
  // Replace "va6" with whichever konductor region is closest to your application server
  const subdomain = currentCluster || "va6";

  // Make the request to experience edge
  const dataStreamId = "dad9f0b7-4d22-41eb-a29e-d765294d483b";
  const url = `https://${subdomain}.server.adobedc.net/ee/v2/interact?dataStreamId=${dataStreamId}`;
  const body = buildRequestBody({ FPID });
  const response = await axios.post(url, body, { headers: { Cookie: cookieHeader } });

  let hybridpocserverPayload;
  response.data.handle.forEach(({ type, payload }) => {
    // find the hybridpocserver scope
    if (type === "personalization:decisions") {
      if (payload[0].scope === "hybridpocserver") {
        hybridpocserverPayload = payload[0];
      }
    }
    // transfer the cookies from Edge to the browser
    if (type === "state:store") {
      payload.forEach(({ key, value, maxAge }) => {
        res.cookie(key, value, { maxAge: maxAge * 1000 });
      })
    }
  });

  // build the XDM to send the display notification on the client
  const displayXdm = {
    eventType: "web.webpagedetails.pageViews",
    web: {
      webPageDetails: {
        name: "option3 browser"
      }
    },
    identityMap: {
      FPID: [
        {
          id: FPID
        }
      ]
    }
  };
  const clickXdm = JSON.parse(JSON.stringify(displayXdm));

  // get the content from the hybridpocserver scope, and update the XDM
  if (hybridpocserverPayload) {
    content = hybridpocserverPayload.items[0].data.content;
    displayXdm.eventType = "decisioning.propositionDisplay";
    displayXdm._experience = {
      decisioning: {
        propositions: [
          {
            id: hybridpocserverPayload.id,
            scope: hybridpocserverPayload.scope,
            scopeDetails: hybridpocserverPayload.scopeDetails
          }
        ]
      }
    };
    clickXdm.eventType = "decisioning.propositionInteract";
    clickXdm._experience = {
      decisioning: {
        propositions: [
          {
            id: hybridpocserverPayload.id,
            scope: hybridpocserverPayload.scope,
            scopeDetails: hybridpocserverPayload.scopeDetails
          }
        ]
      }
    };
  } else {
    content = "No offer returned from edge.";
  }

  // Send the contents of index.html with the two items from the server
  res.set("Content-Type", "text/html");
  res.send(pageContents
    .replace("{{PERSONALIZED_CONTENT}}", content)
    .replace("{{DISPLAY_XDM}}", JSON.stringify(displayXdm, null, 2))
    .replace("{{CLICK_XDM}}", JSON.stringify(clickXdm, null, 2))
  );
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
