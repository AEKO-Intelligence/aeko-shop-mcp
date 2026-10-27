Official UCP JSON Schema resources retrieved unchanged in meaning (JSON pretty-printed)
from https://ucp.dev/2026-04-08/ on 2026-10-19, recursively following schema `$ref`
links from catalog_search.json and catalog_lookup.json. Used offline with AJV's
2020-12 validator in the real-backend protocol probe. Format annotations are not
asserted by the validator; structural requirements, types, references, bounds,
and required lookup `inputs` correlation are asserted. These fixtures establish
schema compatibility for tested responses, not provider enrollment or checkout.
