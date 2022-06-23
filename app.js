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

  // Get the cluster from the request so that it can be added to the URL
  const currentCluster = req.cookies["kndctr_5BFE274A5F6980A50A495C08_AdobeOrg_cluster"];
  const currentClusterPath = currentCluster ? `/${currentCluster}` : "";

  // Make the request to experience edge
  const configId = "bc1a10e0-aee4-4e0e-ac5b-cdbb9abbec83";
  const requestId = randomUUID();
  const url = `https://firstparty.alloyio.com/ee-pre-prd${currentClusterPath}/v1/interact?configId=${configId}&requestId=${requestId}`;
  const body = buildRequestBody({ FPID });
  const response = await axios.post(url, body);

  // extract and write the cluster cookie from the experience edge request
  const cookie =
    response.headers["set-cookie"].find(cookie => cookie.startsWith("kndctr_5BFE274A5F6980A50A495C08_AdobeOrg_cluster="))
  if (cookie) {
    const cluster = cookie.match(/^[^=]*=([^;]*);/)[1];
    res.cookie("kndctr_5BFE274A5F6980A50A495C08_AdobeOrg_cluster", cluster, { maxAge: 1000 * 60 * 30 });
  }

  // find the personalization decision to apply on the server
  const payload = response.data.handle
    .filter(handle =>
      handle.type === "personalization:decisions" &&
      handle.payload[0].scope === "sandbox-personalization-page")
    .map(handle => handle.payload[0])[0];
  const content = payload.items[0].data.content;

  // build the XDM to send the display notification on the client
  const clientXdm = {
    eventType: "decisioning.propositionDisplay",
    _experience: {
      decisioning: {
        propositions: [
          {
            id: payload.id,
            scope: payload.scope,
            scopeDetails: payload.scopeDetails
          }
        ]
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

  // Send the contents of index.html with the two items from the server
  res.set("Content-Type", "text/html");
  res.send(pageContents
    .replace("{{PERSONALIZED_CONTENT}}", content)
    .replace("{{XDM}}", JSON.stringify(clientXdm, null, 2))
  );
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

