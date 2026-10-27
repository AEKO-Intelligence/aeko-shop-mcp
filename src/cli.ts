const mode = process.argv[2];

if (mode === "personal") {
  await import("./personal/server.js");
} else if (mode === "brand") {
  await import("./brand/server.js");
} else if (mode === "hosted") {
  await import("./hosted/cli.js");
} else {
  console.error("Usage: aeko-shop-mcp personal|brand|hosted");
  process.exit(1);
}
