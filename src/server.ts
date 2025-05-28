import fs from "node:fs";
import { Bot, InlineKeyboard } from "grammy";
import { z } from "zod";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

interface Transaction {
	id: number;
	created_at: string;
	title: string;
	type: "INCOME" | "EXPENSE";
	category:
		| "HEALTH"
		| "FOOD"
		| "EDUCATION"
		| "ENTERTAINMENT"
		| "SERVICES"
		| "GIFTS AND DONATIONS"
		| "TRANSPORTATION"
		| "SHOPPING"
		| "SALARY"
		| "INVESTMENTS"
		| "SALES"
		| "PRIZES";
	value: number;
}

const JSON_FILE = "finances.json";

function loadTransactions(): Transaction[] {
	try {
		return JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
	} catch {
		return [];
	}
}

function saveTransactions(transactions: Transaction[]) {
	fs.writeFileSync(JSON_FILE, JSON.stringify(transactions, null, 2));
}

const titleSchema = z.string().min(4).max(32);
const valueSchema = z.coerce.number().int().min(100).max(9999999999);

const userStates = new Map<number, Partial<Transaction & { step: string }>>();

const initialMenu = new InlineKeyboard()
	.text("➕ ADD INCOME", "ADD_INCOME")
	.row()
	.text("➖ ADD EXPENSE", "ADD_EXPENSE")
	.row()
	.text("📋 LAST 10 TRANSACTIONS", "LAST")
	.row()
	.text("✏️ EDIT TRANSACTION", "EDIT")
	.row()
	.text("🗑️ DELETE TRANSACTION", "DELETE")
	.row()
	.text("💸 TOTAL EXPENSES", "TOTAL_EXPENSES")
	.row()
	.text("💰 TOTAL INCOME", "TOTAL_INCOME");

bot.command("start", async (ctx) => {
	userStates.delete(ctx.from!.id);
	await ctx.reply("WHAT WOULD YOU LIKE TO DO?", { reply_markup: initialMenu });
});

// Function to format value in currency
function formatValue(value: number): string {
	return (value / 100).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

bot.on("message:text", async (ctx) => {
	const uid = ctx.from!.id;
	const state = userStates.get(uid);

	// Check cancellation commands
	const text = ctx.message.text.toLowerCase();
	if (text === "cancel" || text === "cancelar" || text === "exit") {
		userStates.delete(uid);
		return ctx.reply("❌ OPERATION CANCELLED.", { reply_markup: initialMenu });
	}

	if (!state) {
		userStates.set(uid, { step: "TITLE" });
		return ctx.reply("WHAT IS THE TRANSACTION TITLE?");
	}

	if (state.step === "EDIT_ID") {
		const id = Number.parseInt(ctx.message.text);
		const transactions = loadTransactions();
		const transaction = transactions.find((t) => t.id === id);
		if (!transaction) {
			return ctx.reply("INVALID ID. TRY AGAIN.");
		}
		userStates.set(uid, { ...transaction, step: "TITLE" });
		const question =
			transaction.type === "INCOME" ? "WHAT IS THE NEW INCOME TITLE?" : "WHAT IS THE NEW EXPENSE TITLE?";
		return ctx.reply(question);
	}

	if (state.step === "DELETE_ID") {
		const id = Number.parseInt(ctx.message.text);
		const transactions = loadTransactions();
		const transaction = transactions.find((t) => t.id === id);
		if (!transaction) {
			return ctx.reply("INVALID ID. TRY AGAIN.");
		}

		const keyboard = new InlineKeyboard().text("✅ YES", "CONFIRM_DELETE").row().text("❌ NO", "CANCEL_DELETE");

		userStates.set(uid, { ...transaction, step: "CONFIRM_DELETE" });

		return ctx.reply(
			`CONFIRM TRANSACTION DELETION:\n\n🆔 ID: ${transaction.id}\n📌 **${transaction.title}**\n💼 ${transaction.type}\n📂 ${transaction.category}\n💰 ${formatValue(transaction.value)}\n🕒 ${transaction.created_at}`,
			{ reply_markup: keyboard, parse_mode: "Markdown" },
		);
	}

	switch (state.step) {
		case "TITLE": {
			const parse = titleSchema.safeParse(ctx.message.text);
			if (!parse.success) {
				return ctx.reply("INVALID TITLE. USE BETWEEN 4 AND 32 CHARACTERS.");
			}
			userStates.set(uid, { ...state, title: ctx.message.text.toUpperCase(), step: "CATEGORY" });

			let keyboard: InlineKeyboard;

			if (state.type === "INCOME") {
				keyboard = new InlineKeyboard()
					.text("SALARY", "CAT_SALARY")
					.row()
					.text("INVESTMENTS", "CAT_INVESTMENTS")
					.row()
					.text("SALES", "CAT_SALES")
					.row()
					.text("PRIZES", "CAT_PRIZES");
			} else {
				keyboard = new InlineKeyboard()
					.text("HEALTH", "CAT_HEALTH")
					.row()
					.text("FOOD", "CAT_FOOD")
					.row()
					.text("EDUCATION", "CAT_EDUCATION")
					.row()
					.text("ENTERTAINMENT", "CAT_ENTERTAINMENT")
					.row()
					.text("SERVICES", "CAT_SERVICES")
					.row()
					.text("GIFTS AND DONATIONS", "CAT_GIFTS AND DONATIONS")
					.row()
					.text("TRANSPORTATION", "CAT_TRANSPORTATION")
					.row()
					.text("SHOPPING", "CAT_SHOPPING");
			}

			return ctx.reply("CHOOSE THE CATEGORY:", { reply_markup: keyboard });
		}

		case "VALUE": {
			const parse = valueSchema.safeParse(ctx.message.text);
			if (!parse.success) {
				return ctx.reply("INVALID VALUE. MINIMUM R$ 1.00. EX: 5900 FOR R$ 59.00");
			}

			const transaction = {
				id: state.id ?? loadTransactions().length + 1,
				created_at: state.created_at ?? new Date().toLocaleString("pt-BR"),
				title: state.title!,
				type: state.type!,
				category: state.category!,
				value: parse.data,
			} satisfies Transaction;

			userStates.set(uid, { ...state, ...transaction, step: "CONFIRMATION" });

			const keyboard = new InlineKeyboard().text("✅ YES", "CONFIRM").row().text("❌ NO", "CANCEL");

			return ctx.reply(
				`CONFIRM SAVING THIS TRANSACTION?\n\n🆔 ID: ${transaction.id}\n📌 *${transaction.title}*\n💼 ${transaction.type}\n📂 ${transaction.category}\n💰 ${formatValue(transaction.value)}\n🕒 ${transaction.created_at}`,
				{ reply_markup: keyboard, parse_mode: "Markdown" },
			);
		}

		default: {
			// Invalid input when expecting button - redisplay appropriate options
			if (state.step === "CATEGORY") {
				let keyboard: InlineKeyboard;

				if (state.type === "INCOME") {
					keyboard = new InlineKeyboard()
						.text("SALARY", "CAT_SALARY")
						.row()
						.text("INVESTMENTS", "CAT_INVESTMENTS")
						.row()
						.text("SALES", "CAT_SALES")
						.row()
						.text("PRIZES", "CAT_PRIZES");
				} else {
					keyboard = new InlineKeyboard()
						.text("HEALTH", "CAT_HEALTH")
						.row()
						.text("FOOD", "CAT_FOOD")
						.row()
						.text("EDUCATION", "CAT_EDUCATION")
						.row()
						.text("ENTERTAINMENT", "CAT_ENTERTAINMENT")
						.row()
						.text("SERVICES", "CAT_SERVICES")
						.row()
						.text("GIFTS AND DONATIONS", "CAT_GIFTS AND DONATIONS")
						.row()
						.text("TRANSPORTATION", "CAT_TRANSPORTATION")
						.row()
						.text("SHOPPING", "CAT_SHOPPING");
				}

				return ctx.reply("PLEASE CHOOSE A CATEGORY USING THE BUTTONS:", { reply_markup: keyboard });
			}

			if (state.step === "CONFIRMATION") {
				const keyboard = new InlineKeyboard().text("✅ YES", "CONFIRM").row().text("❌ NO", "CANCEL");

				return ctx.reply("PLEASE USE THE BUTTONS TO CONFIRM OR CANCEL:", { reply_markup: keyboard });
			}

			if (state.step === "CONFIRM_DELETE") {
				const keyboard = new InlineKeyboard()
					.text("✅ YES", "CONFIRM_DELETE")
					.row()
					.text("❌ NO", "CANCEL_DELETE");

				return ctx.reply("PLEASE USE THE BUTTONS TO CONFIRM OR CANCEL THE DELETION:", {
					reply_markup: keyboard,
				});
			}
		}
	}
});

bot.on("callback_query:data", async (ctx) => {
	if (!ctx.from || !ctx.callbackQuery) return;

	const uid = ctx.from.id;
	const state = userStates.get(uid);
	const data = ctx.callbackQuery.data;

	if (!data) return;

	if (data === "ADD_INCOME" || data === "ADD_EXPENSE") {
		const type = data === "ADD_INCOME" ? "INCOME" : "EXPENSE";
		userStates.set(uid, { type, step: "TITLE" });
		const question = type === "INCOME" ? "WHAT IS THE INCOME TITLE?" : "WHAT IS THE EXPENSE TITLE?";
		return ctx.reply(question);
	}

	if (data.startsWith("CAT_")) {
		const category = data.replace("CAT_", "").toUpperCase() as Transaction["category"];
		userStates.set(uid, { ...state, category, step: "VALUE" });
		const transactionType = state?.type === "INCOME" ? "INCOME" : "EXPENSE";
		return ctx.editMessageText(`WHAT IS THE ${transactionType} VALUE? (EX: 5900 FOR R$ 59.00)`);
	}

	if (data === "CONFIRM") {
		const transactions = loadTransactions();
		const existing = transactions.find((t) => t.id === state!.id);

		if (existing) {
			Object.assign(existing, {
				title: state!.title!,
				type: state!.type!,
				category: state!.category!,
				value: state!.value!,
			});
		} else {
			transactions.push({
				id: state!.id!,
				created_at: state!.created_at!,
				title: state!.title!,
				type: state!.type!,
				category: state!.category!,
				value: state!.value!,
			});
		}

		saveTransactions(transactions);
		userStates.delete(uid);

		const msg = `${state!.type === "INCOME" ? "✅ INCOME" : "✅ EXPENSE"} SAVED SUCCESSFULLY!\n\n🆔 ID: ${state!.id}\n📌 *${state!.title}*\n💼 ${state!.type}\n📂 ${state!.category}\n💰 ${formatValue(state!.value!)}\n🕒 ${state!.created_at}`;

		await ctx.editMessageText(msg, { parse_mode: "Markdown" });
		return ctx.reply("WHAT WOULD YOU LIKE TO DO?", { reply_markup: initialMenu });
	}

	if (data === "CONFIRM_DELETE") {
		const transactions = loadTransactions();
		const index = transactions.findIndex((t) => t.id === state!.id);

		if (index !== -1) {
			const deletedTransaction = transactions.splice(index, 1)[0];
			saveTransactions(transactions);
			userStates.delete(uid);

			if (deletedTransaction) {
				const msg = `🗑️ TRANSACTION DELETED SUCCESSFULLY!\n\n🆔 ID: ${deletedTransaction.id}\n📌 **${deletedTransaction.title}**\n💼 ${deletedTransaction.type}\n📂 ${deletedTransaction.category}\n💰 ${formatValue(deletedTransaction.value)}\n🕒 ${deletedTransaction.created_at}`;
				await ctx.editMessageText(msg, { parse_mode: "Markdown" });
			} else {
				await ctx.editMessageText("Error deleting transaction.");
			}
			return ctx.reply("WHAT WOULD YOU LIKE TO DO?", { reply_markup: initialMenu });
		}
	}

	if (data === "CANCEL") {
		userStates.delete(uid);
		await ctx.editMessageText("❌ TRANSACTION CANCELLED.");
		return ctx.reply("WHAT WOULD YOU LIKE TO DO?", { reply_markup: initialMenu });
	}

	if (data === "CANCEL_DELETE") {
		userStates.delete(uid);
		await ctx.editMessageText("❌ DELETION CANCELLED.");
		return ctx.reply("WHAT WOULD YOU LIKE TO DO?", { reply_markup: initialMenu });
	}

	if (data === "LAST") {
		const transactions = loadTransactions().slice(-10).reverse();
		const text = transactions.length
			? transactions
					.map(
						(t) =>
							`🆔 ID: ${t.id}\n📌 **${t.title}**\n💼 ${t.type}\n📂 ${t.category}\n💰 ${formatValue(t.value)}\n🕒 ${t.created_at}\n`,
					)
					.join("\n")
			: "NO TRANSACTIONS FOUND.";
		return ctx.answerCallbackQuery().then(() => ctx.reply(text, { parse_mode: "Markdown" }));
	}

	if (data === "TOTAL_EXPENSES") {
		const expenses = loadTransactions().filter((t) => t.type === "EXPENSE");
		const total = expenses.reduce((acc, cur) => acc + cur.value, 0);
		const quantity = expenses.length;
		return ctx
			.answerCallbackQuery()
			.then(() => ctx.reply(`💸 TOTAL EXPENSES: ${formatValue(total)} in ${quantity} transactions`));
	}

	if (data === "TOTAL_INCOME") {
		const income = loadTransactions().filter((t) => t.type === "INCOME");
		const total = income.reduce((acc, cur) => acc + cur.value, 0);
		const quantity = income.length;
		return ctx
			.answerCallbackQuery()
			.then(() => ctx.reply(`💰 TOTAL INCOME: ${formatValue(total)} in ${quantity} transactions`));
	}

	if (data === "EDIT") {
		const transactions = loadTransactions();
		if (transactions.length === 0) {
			return ctx.answerCallbackQuery().then(() => ctx.reply("NO TRANSACTIONS TO EDIT."));
		}
		const text = transactions.map((t) => `${t.id} - ${t.title} (${t.type})`).join("\n");
		userStates.set(uid, { step: "EDIT_ID" });
		return ctx.reply(`ENTER THE ID OF THE TRANSACTION YOU WANT TO EDIT:\n\n${text}`);
	}

	if (data === "DELETE") {
		const transactions = loadTransactions();
		if (transactions.length === 0) {
			return ctx.answerCallbackQuery().then(() => ctx.reply("NO TRANSACTIONS TO DELETE."));
		}
		const text = transactions.map((t) => `${t.id} - ${t.title} (${t.type})`).join("\n");
		userStates.set(uid, { step: "DELETE_ID" });
		return ctx.reply(`ENTER THE ID OF THE TRANSACTION YOU WANT TO DELETE:\n\n${text}`);
	}
});

try {
	bot.start();
	console.log("🤖 TELEGRAM FINANCE BOT IS RUNNING...");
} catch (error: any) {
	console.error("❌ ERROR TELEGRAM BOT FINANCES: ", error?.message);
}
