import { createInterface } from "readline";
import { closePool } from "../utils/db.js";
import { answerQuestion } from "../features/chat/use-cases/answerQuestion.js";

export async function interactiveChat() {
  console.log("═".repeat(60));
  console.log("  🤖 AI News Digest — RAG Chat Agent");
  console.log("  Ask questions about recent AI/tech news.");
  console.log("  Type 'quit' or 'exit' to stop.");
  console.log("═".repeat(60));
  console.log();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === "quit" || trimmed === "exit") {
        console.log("\nGoodbye! 👋");
        rl.close();
        await closePool();
        return;
      }

      try {
        const result = await answerQuestion(trimmed);
        console.log(`\nAssistant: ${result.answer}`);
        console.log(
          `\n  📚 Sources used: ${result.sources.map((s) => s.source).join(", ")}`
        );
        console.log();
      } catch (err) {
        console.error(`\n  ✗ Error: ${err.message}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}
