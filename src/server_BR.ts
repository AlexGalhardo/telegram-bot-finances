import fs from "node:fs";
import { Bot, InlineKeyboard } from "grammy";
import { z } from "zod";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

interface Transacao {
	id: number;
	created_at: string;
	titulo: string;
	tipo: "RECEITA" | "DESPESA";
	categoria:
		| "SAÚDE"
		| "ALIMENTAÇÃO"
		| "EDUCAÇÃO"
		| "ENTRETENIMENTO"
		| "SERVIÇOS"
		| "PRESENTES E DOAÇÕES"
		| "TRANSPORTE"
		| "COMPRAS"
		| "SALÁRIO"
		| "INVESTIMENTOS"
		| "VENDAS"
		| "PRÊMIOS";
	valor: number;
}

const JSON_FILE = "financas.json";

function carregarTransacoes(): Transacao[] {
	try {
		return JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
	} catch {
		return [];
	}
}

function salvarTransacoes(transacoes: Transacao[]) {
	fs.writeFileSync(JSON_FILE, JSON.stringify(transacoes, null, 2));
}

const tituloSchema = z.string().min(4).max(32);
const valorSchema = z.coerce.number().int().min(100).max(9999999999);

const estadosUsuario = new Map<number, Partial<Transacao & { etapa: string }>>();

const menuInicial = new InlineKeyboard()
	.text("➕ ADICIONAR RECEITA", "ADICIONAR_RECEITA")
	.row()
	.text("➖ ADICIONAR DESPESA", "ADICIONAR_DESPESA")
	.row()
	.text("📋 ÚLTIMAS 10 TRANSAÇÕES", "ULTIMAS")
	.row()
	.text("✏️ EDITAR TRANSAÇÃO", "EDITAR")
	.row()
	.text("🗑️ DELETAR TRANSAÇÃO", "DELETAR")
	.row()
	.text("💸 TOTAL DESPESAS", "TOTAL_DESPESAS")
	.row()
	.text("💰 TOTAL RECEITAS", "TOTAL_RECEITAS");

bot.command("start", async (ctx) => {
	estadosUsuario.delete(ctx.from!.id);
	await ctx.reply("O QUE VOCÊ GOSTARIA DE FAZER?", { reply_markup: menuInicial });
});

// Função para formatar valor em reais
function formatarValor(valor: number): string {
	return (valor / 100).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

bot.on("message:text", async (ctx) => {
	const uid = ctx.from!.id;
	const estado = estadosUsuario.get(uid);

	// Verificar comandos de cancelamento
	const texto = ctx.message.text.toLowerCase();
	if (texto === "cancelar" || texto === "cancel" || texto === "exit") {
		estadosUsuario.delete(uid);
		return ctx.reply("❌ OPERAÇÃO CANCELADA.", { reply_markup: menuInicial });
	}

	if (!estado) {
		estadosUsuario.set(uid, { etapa: "TITULO" });
		return ctx.reply("QUAL O TÍTULO DA TRANSAÇÃO?");
	}

	if (estado.etapa === "EDITAR_ID") {
		const id = Number.parseInt(ctx.message.text);
		const transacoes = carregarTransacoes();
		const transacao = transacoes.find((t) => t.id === id);
		if (!transacao) {
			return ctx.reply("ID INVÁLIDO. TENTE NOVAMENTE.");
		}
		estadosUsuario.set(uid, { ...transacao, etapa: "TITULO" });
		const pergunta =
			transacao.tipo === "RECEITA" ? "QUAL O NOVO TÍTULO DA RECEITA?" : "QUAL O NOVO TÍTULO DA DESPESA?";
		return ctx.reply(pergunta);
	}

	if (estado.etapa === "DELETAR_ID") {
		const id = Number.parseInt(ctx.message.text);
		const transacoes = carregarTransacoes();
		const transacao = transacoes.find((t) => t.id === id);
		if (!transacao) {
			return ctx.reply("ID INVÁLIDO. TENTE NOVAMENTE.");
		}

		const teclado = new InlineKeyboard()
			.text("✅ SIM", "CONFIRMAR_DELETAR")
			.row()
			.text("❌ NÃO", "CANCELAR_DELETAR");

		estadosUsuario.set(uid, { ...transacao, etapa: "CONFIRMAR_DELETAR" });

		return ctx.reply(
			`CONFIRMAR EXCLUSÃO DA TRANSAÇÃO:\n\n🆔 ID: ${transacao.id}\n📌 **${transacao.titulo}**\n💼 ${transacao.tipo}\n📂 ${transacao.categoria}\n💰 ${formatarValor(transacao.valor)}\n🕒 ${transacao.created_at}`,
			{ reply_markup: teclado, parse_mode: "Markdown" },
		);
	}

	switch (estado.etapa) {
		case "TITULO": {
			const parse = tituloSchema.safeParse(ctx.message.text);
			if (!parse.success) {
				return ctx.reply("TÍTULO INVÁLIDO. USE ENTRE 4 E 32 CARACTERES.");
			}
			estadosUsuario.set(uid, { ...estado, titulo: ctx.message.text.toUpperCase(), etapa: "CATEGORIA" });

			let teclado: InlineKeyboard;

			if (estado.tipo === "RECEITA") {
				teclado = new InlineKeyboard()
					.text("SALÁRIO", "CAT_SALÁRIO")
					.row()
					.text("INVESTIMENTOS", "CAT_INVESTIMENTOS")
					.row()
					.text("VENDAS", "CAT_VENDAS")
					.row()
					.text("PRÊMIOS", "CAT_PRÊMIOS");
			} else {
				teclado = new InlineKeyboard()
					.text("SAÚDE", "CAT_SAÚDE")
					.row()
					.text("ALIMENTAÇÃO", "CAT_ALIMENTAÇÃO")
					.row()
					.text("EDUCAÇÃO", "CAT_EDUCAÇÃO")
					.row()
					.text("ENTRETENIMENTO", "CAT_ENTRETENIMENTO")
					.row()
					.text("SERVIÇOS", "CAT_SERVIÇOS")
					.row()
					.text("PRESENTES E DOAÇÕES", "CAT_PRESENTES E DOAÇÕES")
					.row()
					.text("TRANSPORTE", "CAT_TRANSPORTE")
					.row()
					.text("COMPRAS", "CAT_COMPRAS");
			}

			return ctx.reply("ESCOLHA A CATEGORIA:", { reply_markup: teclado });
		}

		case "VALOR": {
			const parse = valorSchema.safeParse(ctx.message.text);
			if (!parse.success) {
				return ctx.reply("VALOR INVÁLIDO. MÍNIMO R$ 1,00. EX: 5900 PARA R$ 59,00");
			}

			const transacao = {
				id: estado.id ?? carregarTransacoes().length + 1,
				created_at: estado.created_at ?? new Date().toLocaleString("pt-BR"),
				titulo: estado.titulo!,
				tipo: estado.tipo!,
				categoria: estado.categoria!,
				valor: parse.data,
			} satisfies Transacao;

			estadosUsuario.set(uid, { ...estado, ...transacao, etapa: "CONFIRMACAO" });

			const teclado = new InlineKeyboard().text("✅ SIM", "CONFIRMAR").row().text("❌ NÃO", "CANCELAR");

			return ctx.reply(
				`CONFIRMA SALVAR ESTA TRANSAÇÃO?\n\n🆔 ID: ${transacao.id}\n📌 *${transacao.titulo}*\n💼 ${transacao.tipo}\n📂 ${transacao.categoria}\n💰 ${formatarValor(transacao.valor)}\n🕒 ${transacao.created_at}`,
				{ reply_markup: teclado, parse_mode: "Markdown" },
			);
		}

		default: {
			// Input inválido quando esperando botão - reexibir opções apropriadas
			if (estado.etapa === "CATEGORIA") {
				let teclado: InlineKeyboard;

				if (estado.tipo === "RECEITA") {
					teclado = new InlineKeyboard()
						.text("SALÁRIO", "CAT_SALÁRIO")
						.row()
						.text("INVESTIMENTOS", "CAT_INVESTIMENTOS")
						.row()
						.text("VENDAS", "CAT_VENDAS")
						.row()
						.text("PRÊMIOS", "CAT_PRÊMIOS");
				} else {
					teclado = new InlineKeyboard()
						.text("SAÚDE", "CAT_SAÚDE")
						.row()
						.text("ALIMENTAÇÃO", "CAT_ALIMENTAÇÃO")
						.row()
						.text("EDUCAÇÃO", "CAT_EDUCAÇÃO")
						.row()
						.text("ENTRETENIMENTO", "CAT_ENTRETENIMENTO")
						.row()
						.text("SERVIÇOS", "CAT_SERVIÇOS")
						.row()
						.text("PRESENTES E DOAÇÕES", "CAT_PRESENTES E DOAÇÕES")
						.row()
						.text("TRANSPORTE", "CAT_TRANSPORTE")
						.row()
						.text("COMPRAS", "CAT_COMPRAS");
				}

				return ctx.reply("POR FAVOR, ESCOLHA UMA CATEGORIA USANDO OS BOTÕES:", { reply_markup: teclado });
			}

			if (estado.etapa === "CONFIRMACAO") {
				const teclado = new InlineKeyboard().text("✅ SIM", "CONFIRMAR").row().text("❌ NÃO", "CANCELAR");

				return ctx.reply("POR FAVOR, USE OS BOTÕES PARA CONFIRMAR OU CANCELAR:", { reply_markup: teclado });
			}

			if (estado.etapa === "CONFIRMAR_DELETAR") {
				const teclado = new InlineKeyboard()
					.text("✅ SIM", "CONFIRMAR_DELETAR")
					.row()
					.text("❌ NÃO", "CANCELAR_DELETAR");

				return ctx.reply("POR FAVOR, USE OS BOTÕES PARA CONFIRMAR OU CANCELAR A EXCLUSÃO:", {
					reply_markup: teclado,
				});
			}
		}
	}
});

bot.on("callback_query:data", async (ctx) => {
	if (!ctx.from || !ctx.callbackQuery) return;

	const uid = ctx.from.id;
	const estado = estadosUsuario.get(uid);
	const data = ctx.callbackQuery.data;

	if (!data) return;

	if (data === "ADICIONAR_RECEITA" || data === "ADICIONAR_DESPESA") {
		const tipo = data === "ADICIONAR_RECEITA" ? "RECEITA" : "DESPESA";
		estadosUsuario.set(uid, { tipo, etapa: "TITULO" });
		const pergunta = tipo === "RECEITA" ? "QUAL O TÍTULO DA RECEITA?" : "QUAL O TÍTULO DA DESPESA?";
		return ctx.reply(pergunta);
	}

	if (data.startsWith("CAT_")) {
		const categoria = data.replace("CAT_", "").toUpperCase() as Transacao["categoria"];
		estadosUsuario.set(uid, { ...estado, categoria, etapa: "VALOR" });
		const tipoTransacao = estado?.tipo === "RECEITA" ? "RECEITA" : "DESPESA";
		return ctx.editMessageText(`QUAL O VALOR DA ${tipoTransacao}? (EX: 5900 PARA R$ 59,00)`);
	}

	if (data === "CONFIRMAR") {
		const transacoes = carregarTransacoes();
		const existente = transacoes.find((t) => t.id === estado!.id);

		if (existente) {
			Object.assign(existente, {
				titulo: estado!.titulo!,
				tipo: estado!.tipo!,
				categoria: estado!.categoria!,
				valor: estado!.valor!,
			});
		} else {
			transacoes.push({
				id: estado!.id!,
				created_at: estado!.created_at!,
				titulo: estado!.titulo!,
				tipo: estado!.tipo!,
				categoria: estado!.categoria!,
				valor: estado!.valor!,
			});
		}

		salvarTransacoes(transacoes);
		estadosUsuario.delete(uid);

		const msg = `${estado!.tipo === "RECEITA" ? "✅ RECEITA" : "✅ DESPESA"} SALVA COM SUCESSO!\n\n🆔 ID: ${estado!.id}\n📌 *${estado!.titulo}*\n💼 ${estado!.tipo}\n📂 ${estado!.categoria}\n💰 ${formatarValor(estado!.valor!)}\n🕒 ${estado!.created_at}`;

		await ctx.editMessageText(msg, { parse_mode: "Markdown" });
		return ctx.reply("O QUE VOCÊ GOSTARIA DE FAZER?", { reply_markup: menuInicial });
	}

	if (data === "CONFIRMAR_DELETAR") {
		const transacoes = carregarTransacoes();
		const indice = transacoes.findIndex((t) => t.id === estado!.id);

		if (indice !== -1) {
			const transacaoDeletada = transacoes.splice(indice, 1)[0];
			salvarTransacoes(transacoes);
			estadosUsuario.delete(uid);

			if (transacaoDeletada) {
				const msg = `🗑️ TRANSAÇÃO DELETADA COM SUCESSO!\n\n🆔 ID: ${transacaoDeletada.id}\n📌 **${transacaoDeletada.titulo}**\n💼 ${transacaoDeletada.tipo}\n📂 ${transacaoDeletada.categoria}\n💰 ${formatarValor(transacaoDeletada.valor)}\n🕒 ${transacaoDeletada.created_at}`;
				await ctx.editMessageText(msg, { parse_mode: "Markdown" });
			} else {
				await ctx.editMessageText("Erro ao deletar transação.");
			}
			return ctx.reply("O QUE VOCÊ GOSTARIA DE FAZER?", { reply_markup: menuInicial });
		}
	}

	if (data === "CANCELAR") {
		estadosUsuario.delete(uid);
		await ctx.editMessageText("❌ TRANSAÇÃO CANCELADA.");
		return ctx.reply("O QUE VOCÊ GOSTARIA DE FAZER?", { reply_markup: menuInicial });
	}

	if (data === "CANCELAR_DELETAR") {
		estadosUsuario.delete(uid);
		await ctx.editMessageText("❌ EXCLUSÃO CANCELADA.");
		return ctx.reply("O QUE VOCÊ GOSTARIA DE FAZER?", { reply_markup: menuInicial });
	}

	if (data === "ULTIMAS") {
		const transacoes = carregarTransacoes().slice(-10).reverse();
		const texto = transacoes.length
			? transacoes
					.map(
						(t) =>
							`🆔 ID: ${t.id}\n📌 **${t.titulo}**\n💼 ${t.tipo}\n📂 ${t.categoria}\n💰 ${formatarValor(t.valor)}\n🕒 ${t.created_at}\n`,
					)
					.join("\n")
			: "NENHUMA TRANSAÇÃO ENCONTRADA.";
		return ctx.answerCallbackQuery().then(() => ctx.reply(texto, { parse_mode: "Markdown" }));
	}

	if (data === "TOTAL_DESPESAS") {
		const despesas = carregarTransacoes().filter((t) => t.tipo === "DESPESA");
		const total = despesas.reduce((acc, cur) => acc + cur.valor, 0);
		const quantidade = despesas.length;
		return ctx
			.answerCallbackQuery()
			.then(() => ctx.reply(`💸 TOTAL DE DESPESAS: ${formatarValor(total)} em ${quantidade} transações`));
	}

	if (data === "TOTAL_RECEITAS") {
		const receitas = carregarTransacoes().filter((t) => t.tipo === "RECEITA");
		const total = receitas.reduce((acc, cur) => acc + cur.valor, 0);
		const quantidade = receitas.length;
		return ctx
			.answerCallbackQuery()
			.then(() => ctx.reply(`💰 TOTAL DE RECEITAS: ${formatarValor(total)} em ${quantidade} transações`));
	}

	if (data === "EDITAR") {
		const transacoes = carregarTransacoes();
		if (transacoes.length === 0) {
			return ctx.answerCallbackQuery().then(() => ctx.reply("NENHUMA TRANSAÇÃO PARA EDITAR."));
		}
		const texto = transacoes.map((t) => `${t.id} - ${t.titulo} (${t.tipo})`).join("\n");
		estadosUsuario.set(uid, { etapa: "EDITAR_ID" });
		return ctx.reply(`DIGITE O ID DA TRANSAÇÃO QUE DESEJA EDITAR:\n\n${texto}`);
	}

	if (data === "DELETAR") {
		const transacoes = carregarTransacoes();
		if (transacoes.length === 0) {
			return ctx.answerCallbackQuery().then(() => ctx.reply("NENHUMA TRANSAÇÃO PARA DELETAR."));
		}
		const texto = transacoes.map((t) => `${t.id} - ${t.titulo} (${t.tipo})`).join("\n");
		estadosUsuario.set(uid, { etapa: "DELETAR_ID" });
		return ctx.reply(`DIGITE O ID DA TRANSAÇÃO QUE DESEJA DELETAR:\n\n${texto}`);
	}
});

try {
	bot.start();
	console.log("🤖 BOT TELEGRAM FINANÇAS ESTÁ RODANDO...");
} catch (error: any) {
	console.error("❌ ERROR TELEGRAM BOT FINANCES: ", error?.message);
}
