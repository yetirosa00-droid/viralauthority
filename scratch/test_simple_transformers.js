const { pipeline } = require("@xenova/transformers");

async function test() {
  try {
    console.log("Loading pipeline...");
    const pipe = await pipeline("sentiment-analysis");
    const result = await pipe("I love transformers!");
    console.log("Result:", result);
  } catch (err) {
    console.error("Pipeline failed:", err);
  }
}

test();
