const mode = process.argv[2];

if (mode === "personal") {
  await import("./personal/server.js");
} else if (mode === "brand") {
  await import("./brand/server.js");
} else {
  console.error("Usage: aeko-shop-mcp personal|brand");
  process.exit(1);
}
