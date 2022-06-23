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

module.exports = ({ FPID }) => {
  const body = {
    "events": [
        {
            "query": {
                "personalization": {
                    "schemas": [
                        "https://ns.adobe.com/personalization/html-content-item",
                        "https://ns.adobe.com/personalization/json-content-item"
                    ],
                    "decisionScopes": [
                        "sandbox-personalization-page"
                    ]
                }
            },
            "xdm": {
                "web": {
                    "webPageDetails": {
                        "URL": "https://localhost:3000"
                    }
                },
                "timestamp": new Date().toISOString(),
                "implementationDetails": {
                    "name": "https://ns.adobe.com/experience/alloy",
                    "version": "2.11.0",
                    "environment": "browser"
                },
                "eventType": "server-view",
                "identityMap": {
                  "FPID": [
                    {
                      id: FPID
                    }
                  ]
                }
            }
        }
    ],
    "meta": {
        "state": {
            "domain": "alloyio.com",
            "cookiesEnabled": true
        }
    }
  };
  return body;
}
