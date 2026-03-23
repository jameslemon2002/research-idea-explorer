import { cleanText } from "./base.js";

function readBalancedBlock(input, startIndex, openChar, closeChar) {
  let depth = 0;
  let index = startIndex;

  while (index < input.length) {
    const char = input[index];
    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return {
          value: input.slice(startIndex + 1, index),
          nextIndex: index + 1
        };
      }
    }
    index += 1;
  }

  return {
    value: input.slice(startIndex + 1),
    nextIndex: input.length
  };
}

function parseQuotedValue(input, startIndex) {
  let index = startIndex + 1;
  let value = "";

  while (index < input.length) {
    const char = input[index];
    if (char === '"' && input[index - 1] !== "\\") {
      return {
        value,
        nextIndex: index + 1
      };
    }
    value += char;
    index += 1;
  }

  return {
    value,
    nextIndex: input.length
  };
}

function parseRawValue(input, startIndex) {
  let index = startIndex;
  while (index < input.length && input[index] !== ",") {
    index += 1;
  }

  return {
    value: input.slice(startIndex, index).trim(),
    nextIndex: index
  };
}

function parseBibtexFields(body) {
  const fields = {};
  let index = 0;

  while (index < body.length) {
    while (index < body.length && /[\s,]/.test(body[index])) {
      index += 1;
    }

    if (index >= body.length) {
      break;
    }

    const equalsIndex = body.indexOf("=", index);
    if (equalsIndex === -1) {
      break;
    }

    const fieldName = body
      .slice(index, equalsIndex)
      .trim()
      .toLowerCase();

    index = equalsIndex + 1;
    while (index < body.length && /\s/.test(body[index])) {
      index += 1;
    }

    let parsed;
    if (body[index] === "{") {
      parsed = readBalancedBlock(body, index, "{", "}");
    } else if (body[index] === '"') {
      parsed = parseQuotedValue(body, index);
    } else {
      parsed = parseRawValue(body, index);
    }

    fields[fieldName] = cleanText(parsed.value);
    index = parsed.nextIndex + 1;
  }

  return fields;
}

function normalizeBibtexAuthors(value) {
  return String(value || "")
    .split(/\s+and\s+/i)
    .map((author) => author.trim())
    .filter(Boolean)
    .map((author) => {
      if (!author.includes(",")) {
        return author;
      }
      const [family, given] = author.split(",").map((part) => part.trim());
      return [given, family].filter(Boolean).join(" ").trim();
    });
}

function normalizeBibtexEntry(type, key, fields) {
  return {
    id: key,
    key,
    itemType: type,
    title: fields.title || key,
    abstractNote: fields.abstract || "",
    creators: normalizeBibtexAuthors(fields.author).map((name) => ({ name })),
    publicationTitle: fields.journal || fields.booktitle || fields.publisher || "",
    date: fields.date || fields.year || "",
    DOI: fields.doi || "",
    url: fields.url || "",
    tags: String(fields.keywords || fields.keyword || "")
      .split(/,|;/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  };
}

export function parseBibtex(input) {
  const entries = [];
  let index = 0;

  while (index < input.length) {
    const atIndex = input.indexOf("@", index);
    if (atIndex === -1) {
      break;
    }

    const openIndex = input.slice(atIndex).search(/[{(]/);
    if (openIndex === -1) {
      break;
    }

    const type = input
      .slice(atIndex + 1, atIndex + openIndex)
      .trim()
      .toLowerCase();
    const delimiterIndex = atIndex + openIndex;
    const openChar = input[delimiterIndex];
    const closeChar = openChar === "{" ? "}" : ")";
    const block = readBalancedBlock(input, delimiterIndex, openChar, closeChar);
    const entryText = block.value;
    const firstComma = entryText.indexOf(",");

    if (firstComma === -1) {
      index = block.nextIndex;
      continue;
    }

    const key = entryText.slice(0, firstComma).trim();
    const body = entryText.slice(firstComma + 1);
    const fields = parseBibtexFields(body);
    entries.push(normalizeBibtexEntry(type, key, fields));
    index = block.nextIndex;
  }

  return entries;
}
