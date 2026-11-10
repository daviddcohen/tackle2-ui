#!/bin/bash
set -euo pipefail

HOST="${HOST:-http://localhost:9002}"

post() {
  curl -s -X POST "$HOST/$1" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json' \
    -d "$2"
}

echo "=== Seeding realistic data into Konveyor at $HOST ==="

# -------------------------------------------------------
# Job Functions
# -------------------------------------------------------
echo "Creating job functions..."
for jf in \
  '{"name":"Software Engineer"}' \
  '{"name":"Senior Software Engineer"}' \
  '{"name":"Engineering Manager"}' \
  '{"name":"DevOps Engineer"}' \
  '{"name":"QA Lead"}' \
  '{"name":"Solution Architect"}' \
  '{"name":"Product Owner"}' \
  '{"name":"Database Administrator"}' \
  '{"name":"Security Engineer"}' \
  '{"name":"Site Reliability Engineer"}' \
  '{"name":"Technical Lead"}' \
  '{"name":"VP of Engineering"}'
do
  post "jobfunctions" "$jf" > /dev/null
done

# -------------------------------------------------------
# Stakeholder Groups
# -------------------------------------------------------
echo "Creating stakeholder groups..."
for sg in \
  '{"name":"Platform Engineering","description":"Core platform and infrastructure team"}' \
  '{"name":"Retail Applications","description":"Customer-facing retail systems"}' \
  '{"name":"Finance & Payments","description":"Billing, payments, and financial reporting"}' \
  '{"name":"Data & Analytics","description":"Data pipelines and BI"}' \
  '{"name":"Mobile Engineering","description":"iOS and Android apps"}' \
  '{"name":"Security & Compliance","description":"InfoSec and audit"}' \
  '{"name":"Cloud Migration PMO","description":"Project management for cloud migration program"}'
do
  post "stakeholdergroups" "$sg" > /dev/null
done

# -------------------------------------------------------
# Stakeholders
# -------------------------------------------------------
echo "Creating stakeholders..."
post "stakeholders" '{"name":"Maya Chen","email":"maya.chen@acme-corp.io","jobFunction":{"id":6},"stakeholderGroups":[{"id":1}]}' > /dev/null
post "stakeholders" '{"name":"James Okafor","email":"james.okafor@acme-corp.io","jobFunction":{"id":3},"stakeholderGroups":[{"id":2}]}' > /dev/null
post "stakeholders" '{"name":"Priya Sharma","email":"priya.sharma@acme-corp.io","jobFunction":{"id":7},"stakeholderGroups":[{"id":3}]}' > /dev/null
post "stakeholders" '{"name":"Carlos Rivera","email":"carlos.rivera@acme-corp.io","jobFunction":{"id":4},"stakeholderGroups":[{"id":1}]}' > /dev/null
post "stakeholders" '{"name":"Sarah Kim","email":"sarah.kim@acme-corp.io","jobFunction":{"id":1},"stakeholderGroups":[{"id":2}]}' > /dev/null
post "stakeholders" '{"name":"David Nguyen","email":"david.nguyen@acme-corp.io","jobFunction":{"id":2},"stakeholderGroups":[{"id":4}]}' > /dev/null
post "stakeholders" '{"name":"Elena Petrov","email":"elena.petrov@acme-corp.io","jobFunction":{"id":9},"stakeholderGroups":[{"id":6}]}' > /dev/null
post "stakeholders" '{"name":"Marcus Johnson","email":"marcus.johnson@acme-corp.io","jobFunction":{"id":8},"stakeholderGroups":[{"id":4}]}' > /dev/null
post "stakeholders" '{"name":"Aisha Bello","email":"aisha.bello@acme-corp.io","jobFunction":{"id":5},"stakeholderGroups":[{"id":2}]}' > /dev/null
post "stakeholders" '{"name":"Tom Bradley","email":"tom.bradley@acme-corp.io","jobFunction":{"id":12},"stakeholderGroups":[{"id":7}]}' > /dev/null
post "stakeholders" '{"name":"Rachel Foster","email":"rachel.foster@acme-corp.io","jobFunction":{"id":11},"stakeholderGroups":[{"id":5}]}' > /dev/null
post "stakeholders" '{"name":"Jun Watanabe","email":"jun.watanabe@acme-corp.io","jobFunction":{"id":10},"stakeholderGroups":[{"id":1}]}' > /dev/null

# -------------------------------------------------------
# Business Services
# -------------------------------------------------------
echo "Creating business services..."
post "businessservices" '{"name":"Online Retail Platform","description":"Customer-facing e-commerce storefront and checkout","owner":{"id":2}}' > /dev/null
post "businessservices" '{"name":"Payment Processing","description":"Credit card processing, fraud detection, and settlement","owner":{"id":3}}' > /dev/null
post "businessservices" '{"name":"Inventory Management","description":"Warehouse and supply chain inventory tracking","owner":{"id":2}}' > /dev/null
post "businessservices" '{"name":"Customer Identity","description":"User authentication, SSO, and profile management","owner":{"id":7}}' > /dev/null
post "businessservices" '{"name":"Data Analytics Platform","description":"Enterprise BI, reporting, and data lake","owner":{"id":6}}' > /dev/null
post "businessservices" '{"name":"Internal Tools","description":"Employee-facing admin portals and back-office systems","owner":{"id":1}}' > /dev/null
post "businessservices" '{"name":"Mobile Backend","description":"APIs and services powering the mobile apps","owner":{"id":11}}' > /dev/null
post "businessservices" '{"name":"Notification Service","description":"Email, SMS, and push notification delivery","owner":{"id":4}}' > /dev/null

# -------------------------------------------------------
# Identities (credentials)
# -------------------------------------------------------
echo "Creating identities..."
post "identities" '{"name":"GitHub Enterprise","kind":"source","description":"GitHub Enterprise source credentials","user":"acme-bot","password":"ghp_xxxxxxxxxxxx"}' > /dev/null
post "identities" '{"name":"GitLab On-Prem","kind":"source","description":"Self-hosted GitLab credentials","user":"deploy-bot","password":"glpat-xxxxxxxxxxxx"}' > /dev/null
post "identities" '{"name":"Nexus Maven","kind":"maven","description":"Nexus artifact repository credentials","user":"maven-reader","password":"Nxs-xxxxxxxxxxxx"}' > /dev/null

# -------------------------------------------------------
# Applications (25 realistic enterprise apps)
# -------------------------------------------------------
echo "Creating applications..."

# -- Retail Platform --
post "applications" '{
  "name":"storefront-web",
  "description":"React-based e-commerce storefront serving 2M+ monthly users. Built on a monolithic Java backend that has grown organically over 8 years.",
  "businessService":{"id":1},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/storefront-web.git","branch":"main"},
  "tags":[{"id":78},{"id":167},{"id":163}],
  "owner":{"id":5},
  "contributors":[{"id":2},{"id":9}]
}' > /dev/null

post "applications" '{
  "name":"product-catalog-api",
  "description":"REST API managing 500K+ product SKUs, pricing, and promotions. Spring Boot monolith with PostgreSQL backend.",
  "businessService":{"id":1},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/product-catalog.git","branch":"main"},
  "tags":[{"id":78},{"id":167},{"id":181}],
  "owner":{"id":5}
}' > /dev/null

post "applications" '{
  "name":"shopping-cart-service",
  "description":"Session-based shopping cart with Redis caching. Handles 10K concurrent sessions during peak sales.",
  "businessService":{"id":1},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/shopping-cart.git","branch":"main"},
  "tags":[{"id":78},{"id":167}],
  "owner":{"id":5}
}' > /dev/null

post "applications" '{
  "name":"search-indexer",
  "description":"Elasticsearch-powered product search with autocomplete. Indexes nightly from the catalog DB.",
  "businessService":{"id":1},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/search-indexer.git","branch":"main"},
  "tags":[{"id":78},{"id":12}],
  "owner":{"id":6}
}' > /dev/null

post "applications" '{
  "name":"recommendation-engine",
  "description":"ML-based product recommendation service built with Python and TensorFlow. Runs batch predictions overnight.",
  "businessService":{"id":1},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/recommendations.git","branch":"main"},
  "tags":[{"id":180},{"id":17}],
  "owner":{"id":6}
}' > /dev/null

# -- Payment Processing --
post "applications" '{
  "name":"payment-gateway",
  "description":"PCI-DSS compliant payment processing service. Handles credit card tokenization and settlement via Stripe and Braintree.",
  "businessService":{"id":2},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/payment-gateway.git","branch":"main"},
  "tags":[{"id":78},{"id":167},{"id":169}],
  "owner":{"id":3}
}' > /dev/null

post "applications" '{
  "name":"fraud-detection",
  "description":"Real-time fraud scoring engine using rules and ML models. Processes every transaction within 200ms SLA.",
  "businessService":{"id":2},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/fraud-detection.git","branch":"main"},
  "tags":[{"id":78},{"id":167}],
  "owner":{"id":7}
}' > /dev/null

post "applications" '{
  "name":"billing-ledger",
  "description":"Financial ledger and invoicing system. Legacy Java EE app running on WebSphere with Oracle DB.",
  "businessService":{"id":2},
  "repository":{"kind":"git","url":"https://gitlab.acme-corp.io/finance/billing-ledger.git","branch":"master"},
  "tags":[{"id":78},{"id":165},{"id":182}],
  "owner":{"id":3}
}' > /dev/null

# -- Inventory Management --
post "applications" '{
  "name":"warehouse-mgmt",
  "description":"Warehouse management system tracking inventory across 12 distribution centers. J2EE app deployed on JBoss EAP.",
  "businessService":{"id":3},
  "repository":{"kind":"git","url":"https://gitlab.acme-corp.io/supply-chain/warehouse-mgmt.git","branch":"master"},
  "tags":[{"id":78},{"id":169},{"id":163}],
  "owner":{"id":2}
}' > /dev/null

post "applications" '{
  "name":"supply-chain-planner",
  "description":"Demand forecasting and procurement planning. COBOL batch jobs running on z/OS with DB2.",
  "businessService":{"id":3},
  "repository":{"kind":"git","url":"https://gitlab.acme-corp.io/supply-chain/planner.git","branch":"main"},
  "tags":[{"id":177},{"id":171}],
  "owner":{"id":2}
}' > /dev/null

post "applications" '{
  "name":"shipping-tracker",
  "description":"Real-time shipment tracking and carrier integration. Spring Boot microservice with Kafka event streaming.",
  "businessService":{"id":3},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/shipping-tracker.git","branch":"main"},
  "tags":[{"id":78},{"id":167}],
  "owner":{"id":4}
}' > /dev/null

# -- Customer Identity --
post "applications" '{
  "name":"identity-provider",
  "description":"Centralized OAuth2/OIDC identity provider handling 5M+ user accounts. Custom Java app wrapping Keycloak.",
  "businessService":{"id":4},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/identity-provider.git","branch":"main"},
  "tags":[{"id":78},{"id":167}],
  "owner":{"id":7}
}' > /dev/null

post "applications" '{
  "name":"user-profile-service",
  "description":"User preferences, addresses, and loyalty points. Quarkus microservice with MongoDB.",
  "businessService":{"id":4},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/user-profile.git","branch":"main"},
  "tags":[{"id":78},{"id":167}],
  "owner":{"id":5}
}' > /dev/null

# -- Data Analytics --
post "applications" '{
  "name":"etl-pipeline",
  "description":"Nightly ETL pipelines ingesting data from 15+ sources into the data warehouse. Apache Spark on Hadoop cluster.",
  "businessService":{"id":5},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/etl-pipeline.git","branch":"main"},
  "tags":[{"id":78},{"id":3}],
  "owner":{"id":8}
}' > /dev/null

post "applications" '{
  "name":"reporting-dashboard",
  "description":"Executive BI dashboards and ad-hoc reporting. Python Flask app with Plotly charts, querying Snowflake.",
  "businessService":{"id":5},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/reporting-dashboard.git","branch":"main"},
  "tags":[{"id":180},{"id":179}],
  "owner":{"id":6}
}' > /dev/null

post "applications" '{
  "name":"data-lake-ingestion",
  "description":"Real-time event streaming into the data lake. Kafka Connect pipelines with custom transformers.",
  "businessService":{"id":5},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/data-lake-ingestion.git","branch":"main"},
  "tags":[{"id":78}],
  "owner":{"id":8}
}' > /dev/null

# -- Internal Tools --
post "applications" '{
  "name":"admin-portal",
  "description":"Internal admin dashboard for customer support. AngularJS SPA from 2016, due for modernization.",
  "businessService":{"id":6},
  "repository":{"kind":"git","url":"https://gitlab.acme-corp.io/internal/admin-portal.git","branch":"develop"},
  "tags":[{"id":179},{"id":167}],
  "owner":{"id":1}
}' > /dev/null

post "applications" '{
  "name":"hr-portal",
  "description":"Employee self-service portal for PTO, benefits, and org chart. ASP.NET app on Windows Server.",
  "businessService":{"id":6},
  "repository":{"kind":"git","url":"https://gitlab.acme-corp.io/internal/hr-portal.git","branch":"main"},
  "tags":[{"id":175},{"id":170}],
  "owner":{"id":10}
}' > /dev/null

post "applications" '{
  "name":"config-management-db",
  "description":"CMDB tracking all infrastructure assets and service dependencies. Custom Java app with MySQL.",
  "businessService":{"id":6},
  "repository":{"kind":"git","url":"https://gitlab.acme-corp.io/internal/cmdb.git","branch":"main"},
  "tags":[{"id":78},{"id":167}],
  "owner":{"id":12}
}' > /dev/null

# -- Mobile Backend --
post "applications" '{
  "name":"mobile-bff",
  "description":"Backend-for-frontend aggregation layer for mobile apps. Node.js/Express API gateway.",
  "businessService":{"id":7},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/mobile-bff.git","branch":"main"},
  "tags":[{"id":179}],
  "owner":{"id":11}
}' > /dev/null

post "applications" '{
  "name":"push-notification-worker",
  "description":"Processes push notification queues for iOS/Android. Go microservice with RabbitMQ consumer.",
  "businessService":{"id":8},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/push-worker.git","branch":"main"},
  "tags":[{"id":78}],
  "owner":{"id":4}
}' > /dev/null

post "applications" '{
  "name":"email-sender",
  "description":"Transactional and marketing email rendering and delivery. Java app using SendGrid API.",
  "businessService":{"id":8},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/email-sender.git","branch":"main"},
  "tags":[{"id":78},{"id":167}],
  "owner":{"id":4}
}' > /dev/null

post "applications" '{
  "name":"content-management",
  "description":"Headless CMS managing marketing content, landing pages, and blog posts. WordPress + custom REST plugin.",
  "businessService":{"id":1},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/content-cms.git","branch":"main"},
  "tags":[{"id":180}],
  "owner":{"id":2}
}' > /dev/null

post "applications" '{
  "name":"legacy-order-processor",
  "description":"Batch order processing system from 2009. Monolithic EAR deployed on WebLogic with Oracle RAC backend. Handles 50K+ orders daily.",
  "businessService":{"id":1},
  "repository":{"kind":"git","url":"https://gitlab.acme-corp.io/legacy/order-processor.git","branch":"master"},
  "tags":[{"id":78},{"id":165},{"id":183}],
  "owner":{"id":2}
}' > /dev/null

post "applications" '{
  "name":"api-gateway",
  "description":"Central API gateway handling rate limiting, auth, and request routing for all public APIs. Kong-based with custom Lua plugins.",
  "businessService":{"id":7},
  "repository":{"kind":"git","url":"https://github.com/acme-corp/api-gateway.git","branch":"main"},
  "tags":[{"id":78}],
  "owner":{"id":1}
}' > /dev/null

# -------------------------------------------------------
# Dependencies between applications
# -------------------------------------------------------
echo "Creating application dependencies..."
# storefront-web depends on product-catalog-api, shopping-cart, identity-provider, search-indexer
post "dependencies" '{"from":{"id":1},"to":{"id":2}}' > /dev/null
post "dependencies" '{"from":{"id":1},"to":{"id":3}}' > /dev/null
post "dependencies" '{"from":{"id":1},"to":{"id":12}}' > /dev/null
post "dependencies" '{"from":{"id":1},"to":{"id":4}}' > /dev/null
# shopping-cart depends on product-catalog-api
post "dependencies" '{"from":{"id":3},"to":{"id":2}}' > /dev/null
# search-indexer depends on product-catalog-api
post "dependencies" '{"from":{"id":4},"to":{"id":2}}' > /dev/null
# recommendation-engine depends on product-catalog, etl-pipeline
post "dependencies" '{"from":{"id":5},"to":{"id":2}}' > /dev/null
post "dependencies" '{"from":{"id":5},"to":{"id":14}}' > /dev/null
# payment-gateway depends on fraud-detection, identity-provider
post "dependencies" '{"from":{"id":6},"to":{"id":7}}' > /dev/null
post "dependencies" '{"from":{"id":6},"to":{"id":12}}' > /dev/null
# billing-ledger depends on payment-gateway
post "dependencies" '{"from":{"id":8},"to":{"id":6}}' > /dev/null
# warehouse-mgmt depends on supply-chain-planner, shipping-tracker
post "dependencies" '{"from":{"id":9},"to":{"id":10}}' > /dev/null
post "dependencies" '{"from":{"id":9},"to":{"id":11}}' > /dev/null
# shipping-tracker depends on email-sender (notifications)
post "dependencies" '{"from":{"id":11},"to":{"id":22}}' > /dev/null
# user-profile depends on identity-provider
post "dependencies" '{"from":{"id":13},"to":{"id":12}}' > /dev/null
# etl-pipeline depends on data-lake-ingestion
post "dependencies" '{"from":{"id":14},"to":{"id":16}}' > /dev/null
# reporting-dashboard depends on etl-pipeline
post "dependencies" '{"from":{"id":15},"to":{"id":14}}' > /dev/null
# mobile-bff depends on product-catalog, user-profile, payment-gateway, api-gateway
post "dependencies" '{"from":{"id":20},"to":{"id":2}}' > /dev/null
post "dependencies" '{"from":{"id":20},"to":{"id":13}}' > /dev/null
post "dependencies" '{"from":{"id":20},"to":{"id":6}}' > /dev/null
post "dependencies" '{"from":{"id":20},"to":{"id":25}}' > /dev/null
# push-notification depends on api-gateway
post "dependencies" '{"from":{"id":21},"to":{"id":25}}' > /dev/null
# legacy-order-processor depends on payment-gateway, warehouse-mgmt, email-sender
post "dependencies" '{"from":{"id":24},"to":{"id":6}}' > /dev/null
post "dependencies" '{"from":{"id":24},"to":{"id":9}}' > /dev/null
post "dependencies" '{"from":{"id":24},"to":{"id":22}}' > /dev/null
# admin-portal depends on identity-provider, config-management-db
post "dependencies" '{"from":{"id":17},"to":{"id":12}}' > /dev/null
post "dependencies" '{"from":{"id":17},"to":{"id":19}}' > /dev/null
# storefront depends on legacy-order-processor, content-management
post "dependencies" '{"from":{"id":1},"to":{"id":24}}' > /dev/null
post "dependencies" '{"from":{"id":1},"to":{"id":23}}' > /dev/null

# -------------------------------------------------------
# Reviews for some applications
# -------------------------------------------------------
echo "Creating reviews..."
post "reviews" '{"businessCriticality":5,"effortEstimate":"extra_large","proposedAction":"replatform","workPriority":1,"comments":"Critical revenue-generating app. Complex monolith needs careful migration planning. Recommend replatform to containers first, then break into microservices.","application":{"id":1}}' > /dev/null
post "reviews" '{"businessCriticality":4,"effortEstimate":"medium","proposedAction":"replatform","workPriority":2,"comments":"Well-structured Spring Boot app. Good candidate for containerization with minimal changes.","application":{"id":2}}' > /dev/null
post "reviews" '{"businessCriticality":5,"effortEstimate":"small","proposedAction":"replatform","workPriority":1,"comments":"Already uses Redis and stateless design. Straightforward container migration.","application":{"id":3}}' > /dev/null
post "reviews" '{"businessCriticality":5,"effortEstimate":"large","proposedAction":"refactor","workPriority":1,"comments":"PCI-DSS compliance requirements add complexity. Must maintain audit trail during migration.","application":{"id":6}}' > /dev/null
post "reviews" '{"businessCriticality":4,"effortEstimate":"extra_large","proposedAction":"refactor","workPriority":3,"comments":"Legacy WebSphere app with tight Oracle coupling. Significant refactoring needed to decouple from vendor-specific APIs.","application":{"id":8}}' > /dev/null
post "reviews" '{"businessCriticality":3,"effortEstimate":"extra_large","proposedAction":"retire","workPriority":5,"comments":"COBOL batch jobs on mainframe. Long-term plan to retire and replace with cloud-native forecasting service.","application":{"id":10}}' > /dev/null
post "reviews" '{"businessCriticality":3,"effortEstimate":"small","proposedAction":"replatform","workPriority":4,"comments":"Simple Spring Boot service. Container-ready with minor config changes.","application":{"id":11}}' > /dev/null
post "reviews" '{"businessCriticality":5,"effortEstimate":"medium","proposedAction":"replatform","workPriority":2,"comments":"Critical identity infrastructure. Keycloak already container-native, wrapper needs minor updates.","application":{"id":12}}' > /dev/null
post "reviews" '{"businessCriticality":2,"effortEstimate":"large","proposedAction":"refactor","workPriority":6,"comments":"Outdated AngularJS frontend. Plan to rewrite in React during migration.","application":{"id":17}}' > /dev/null
post "reviews" '{"businessCriticality":2,"effortEstimate":"medium","proposedAction":"retain","workPriority":7,"comments":"ASP.NET app with Windows dependencies. Keep on-prem for now, evaluate .NET Core migration later.","application":{"id":18}}' > /dev/null
post "reviews" '{"businessCriticality":4,"effortEstimate":"extra_large","proposedAction":"refactor","workPriority":2,"comments":"Most critical legacy system. WebLogic + Oracle RAC makes this the hardest migration target. Needs phased approach.","application":{"id":24}}' > /dev/null
post "reviews" '{"businessCriticality":4,"effortEstimate":"small","proposedAction":"replatform","workPriority":3,"comments":"Go microservice, already stateless and 12-factor compliant. Trivial to containerize.","application":{"id":21}}' > /dev/null

# -------------------------------------------------------
# Migration Waves
# -------------------------------------------------------
echo "Creating migration waves..."
post "migrationwaves" '{
  "name":"Wave 1 - Quick Wins",
  "startDate":"2026-07-01T00:00:00Z",
  "endDate":"2026-09-30T00:00:00Z",
  "applications":[{"id":3},{"id":11},{"id":13},{"id":21}],
  "stakeholders":[{"id":4},{"id":5}],
  "stakeholderGroups":[{"id":1}]
}' > /dev/null

post "migrationwaves" '{
  "name":"Wave 2 - Core Services",
  "startDate":"2026-10-01T00:00:00Z",
  "endDate":"2027-01-31T00:00:00Z",
  "applications":[{"id":2},{"id":4},{"id":12},{"id":20},{"id":25}],
  "stakeholders":[{"id":1},{"id":5},{"id":11}],
  "stakeholderGroups":[{"id":1},{"id":2}]
}' > /dev/null

post "migrationwaves" '{
  "name":"Wave 3 - Revenue Critical",
  "startDate":"2027-02-01T00:00:00Z",
  "endDate":"2027-06-30T00:00:00Z",
  "applications":[{"id":1},{"id":6},{"id":7}],
  "stakeholders":[{"id":2},{"id":3},{"id":7}],
  "stakeholderGroups":[{"id":2},{"id":3},{"id":7}]
}' > /dev/null

post "migrationwaves" '{
  "name":"Wave 4 - Legacy Modernization",
  "startDate":"2027-07-01T00:00:00Z",
  "endDate":"2027-12-31T00:00:00Z",
  "applications":[{"id":8},{"id":9},{"id":24}],
  "stakeholders":[{"id":2},{"id":3},{"id":10}],
  "stakeholderGroups":[{"id":3},{"id":7}]
}' > /dev/null

# -------------------------------------------------------
# Archetypes
# -------------------------------------------------------
echo "Creating archetypes..."
post "archetypes" '{
  "name":"Spring Boot Microservice",
  "description":"Modern Java microservices using Spring Boot with REST APIs, typically stateless and container-ready.",
  "criteria":[{"id":78},{"id":16}],
  "tags":[{"id":78},{"id":167}],
  "stakeholders":[{"id":1},{"id":5}],
  "stakeholderGroups":[{"id":1}]
}' > /dev/null

post "archetypes" '{
  "name":"Legacy Java EE Monolith",
  "description":"Older Java EE applications deployed on traditional app servers (WebLogic, WebSphere, JBoss) with tight database coupling.",
  "criteria":[{"id":78},{"id":7}],
  "tags":[{"id":78},{"id":165}],
  "stakeholders":[{"id":2}],
  "stakeholderGroups":[{"id":7}]
}' > /dev/null

post "archetypes" '{
  "name":"Python Data Service",
  "description":"Python-based data processing and analytics applications.",
  "criteria":[{"id":180}],
  "tags":[{"id":180}],
  "stakeholders":[{"id":6},{"id":8}],
  "stakeholderGroups":[{"id":4}]
}' > /dev/null

post "archetypes" '{
  "name":"Frontend SPA",
  "description":"Single-page web applications built with JavaScript frameworks (React, Angular, Vue).",
  "criteria":[{"id":179}],
  "tags":[{"id":179}],
  "stakeholders":[{"id":5}],
  "stakeholderGroups":[{"id":2}]
}' > /dev/null

# -------------------------------------------------------
# Summary
# -------------------------------------------------------
echo ""
echo "=== Seed complete! ==="
apps=$(curl -s "$HOST/applications" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
deps=$(curl -s "$HOST/dependencies" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
svc=$(curl -s "$HOST/businessservices" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
stk=$(curl -s "$HOST/stakeholders" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
rev=$(curl -s "$HOST/reviews" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
waves=$(curl -s "$HOST/migrationwaves" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
arch=$(curl -s "$HOST/archetypes" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
echo "  Applications:      $apps"
echo "  Dependencies:      $deps"
echo "  Business Services: $svc"
echo "  Stakeholders:      $stk"
echo "  Reviews:           $rev"
echo "  Migration Waves:   $waves"
echo "  Archetypes:        $arch"
echo ""
echo "Open http://localhost:9000 to explore!"
