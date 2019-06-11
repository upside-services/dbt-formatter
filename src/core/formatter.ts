import { trimEnd } from 'lodash'
import Indentation from './indentation'
import InlineBlock from './inline-block'
import tokenTypes from '../constants/token-types'
import { Options, Token } from '../constants/interfaces'

// Whitespace assumptions:
// 1. The previous token will always add a whitespace if needed.
// 2. You should mostly care about appending whitespace(s) at the end.

// Token assumptions:
// 1. Always try to derive rules based on next token if needed
export default class Formatter {
  tokens: Token[] = []
  index: number = 0
  upper: boolean = false
  isMarker: boolean = false
  indentation: Indentation
  inlineBlock = new InlineBlock()
  previousReservedWord: Token = { type: '', value: '' }

  constructor(opt: Options) {
    const { indent, upper } = opt
    this.upper = upper ? upper : false
    this.indentation = new Indentation(indent)
  }

  format(tokens: Token[]) {
    this.tokens = tokens
    let formattedQuery = ''

    this.tokens.forEach((token, index) => {
      this.index = index

      if (token.type === tokenTypes.DBT_START_VAR) {
        formattedQuery = this.formatVariableStart(token, formattedQuery)
      } else if (token.type === tokenTypes.DBT_END_VAR) {
        formattedQuery = this.formatVariableEnd(token, formattedQuery)
      } else if (token.type === tokenTypes.DBT_START_TEMPLATE) {
        formattedQuery = this.formatTemplateStart(token, formattedQuery)
      } else if (token.type === tokenTypes.DBT_END_TEMPLATE) {
        formattedQuery = this.formatTemplateEnd(token, formattedQuery)
      } else if (token.type === tokenTypes.DBT_START_MARKERS) {
        formattedQuery = this.formatDBTStartMarker(token, formattedQuery)
      } else if (token.type === tokenTypes.DBT_END_MARKERS) {
        formattedQuery = this.formatDBTEndMarker(token, formattedQuery)
      } else if (token.type === tokenTypes.WHITESPACE) {
        // ignore (we do our own whitespace formatting)
      } else if (token.type === tokenTypes.LINE_COMMENT) {
        formattedQuery = this.formatLineComment(token, formattedQuery)
      } else if (token.type === tokenTypes.BLOCK_COMMENT) {
        formattedQuery = this.formatBlockComment(token, formattedQuery)
      } else if (token.type === tokenTypes.RESERVED_TOPLEVEL) {
        formattedQuery = this.formatToplevelReservedWord(token, formattedQuery)
        this.previousReservedWord = token
      } else if (token.type === tokenTypes.RESERVED_NEWLINE) {
        formattedQuery = this.formatNewlineReservedWord(token, formattedQuery)
        this.previousReservedWord = token
      } else if (token.type === tokenTypes.RESERVED) {
        formattedQuery = this.formatReservedWord(token, formattedQuery)
        this.previousReservedWord = token
      } else if (token.type === tokenTypes.OPEN_PAREN) {
        formattedQuery = this.formatOpeningParentheses(token, formattedQuery)
      } else if (token.type === tokenTypes.CLOSE_PAREN) {
        formattedQuery = this.formatClosingParentheses(token, formattedQuery)
      } else if (token.value === ',') {
        formattedQuery = this.formatComma(token, formattedQuery)
      } else if (token.value === ':') {
        formattedQuery = this.formatWithSpaceAfter(token, formattedQuery)
      } else if (token.value === '.') {
        formattedQuery = this.formatWithoutSpaces(token, formattedQuery)
      } else if (token.value === ';') {
        formattedQuery = this.formatQuerySeparator(token, formattedQuery)
      } else {
        formattedQuery = this.formatWithSpaces(token, formattedQuery)
      }
    })

    return formattedQuery.trim()
  }

  /*
   HELPERS
   */
  addNewline(query: string, lines: number = 1) {
    return trimEnd(query) + '\n'.repeat(lines) + this.indentation.getIndent()
  }

  // Replace any sequence of whitespace characters with single space
  equalizeWhitespace(st: string) {
    return st.replace(/\s+/g, ' ')
  }

  addWhitespace(st: string, pre: boolean = false) {
    if (pre) {
      return this.equalizeWhitespace(' ' + st)
    }

    return this.equalizeWhitespace(st + ' ')
  }

  removeWhitespace(st: string) {
    return st.replace(/\s+/g, '')
  }

  indentComment(comment: string) {
    return comment.replace(/\n/g, '\n' + this.indentation.getIndent())
  }

  trimTrailingWhitespace(query: string) {
    if (this.getPreviousNonWhitespaceToken().type === tokenTypes.LINE_COMMENT) {
      return trimEnd(query) + '\n'
    } else {
      return trimEnd(query)
    }
  }

  getPreviousNonWhitespaceToken() {
    let n = 1
    while (this.previousToken(n).type === tokenTypes.WHITESPACE) {
      n++
    }
    return this.previousToken(n)
  }

  getNextNonWhitespaceToken() {
    let n = 1
    while (this.nextToken(n).type === tokenTypes.WHITESPACE) {
      n++
    }
    return this.nextToken(n)
  }

  nextToken(offset = 1) {
    return this.tokens[this.index + offset] || {}
  }

  previousToken(offset = 1) {
    return this.tokens[this.index - offset] || {}
  }

  /*
  FORMATTERS
   */
  formatVariableStart(token: Token, query: string) {
    return query + this.addWhitespace(this.removeWhitespace(token.value))
  }

  formatVariableEnd(token: Token, query: string) {
    // Remove whitespaces from token and add space at the end
    query += this.addWhitespace(this.removeWhitespace(token.value))

    const nextToken = this.getNextNonWhitespaceToken()

    // If the next token is a reserved word (as, when,...) don't add
    // a new line.
    if (nextToken.type === tokenTypes.RESERVED) {
      return query
    }

    // If the next token is a select statement add 2 lines.
    // if the next token is a template start token add 2 lines.
    const condition =
      (nextToken.type === tokenTypes.RESERVED_TOPLEVEL &&
        nextToken.value.toLowerCase() === 'select') ||
      nextToken.type === tokenTypes.DBT_START_TEMPLATE
    const lines = condition ? 2 : 1

    if (condition) this.indentation.reset()

    return this.addNewline(query, lines)
  }

  formatTemplateStart(token: Token, query: string) {
    const nextToken = this.getNextNonWhitespaceToken()
    const newToken = this.addWhitespace(this.removeWhitespace(token.value))

    // If we have an end marker up next, reset indentation
    // and add a new line.
    if (nextToken.type === tokenTypes.DBT_END_MARKERS) {
      this.indentation.reset()
      query = this.addNewline(query)
    }

    return query + newToken
  }

  formatTemplateEnd(token: Token, query: string) {
    query += this.addWhitespace(token.value)
    const nextToken = this.getNextNonWhitespaceToken()

    const condition = nextToken.type === tokenTypes.DBT_START_VAR && !this.isMarker
    const lines = condition ? 2 : 1

    if (this.isMarker) {
      this.indentation.increaseToplevel()
      this.isMarker = false
    }

    return this.addNewline(query, lines)
  }

  formatDBTStartMarker(token: Token, query: string) {
    this.isMarker = true
    return query + this.addWhitespace(token.value)
  }

  formatDBTEndMarker(token: Token, query: string) {
    return query + this.addWhitespace(token.value)
  }

  formatLineComment(token: Token, query: string) {
    return this.addNewline(query + token.value)
  }

  formatBlockComment(token: Token, query: string) {
    return this.addNewline(this.addNewline(query) + this.indentComment(token.value))
  }

  formatReservedWord(token: Token, query: string) {
    token.value = this.upper ? token.value.toUpperCase() : token.value
    return this.formatWithSpaces(token, query)
  }

  formatToplevelReservedWord(token: Token, query: string) {
    // We have to look at previous token here.
    const prevToken = this.getPreviousNonWhitespaceToken()

    if (prevToken.type === tokenTypes.DBT_START_TEMPLATE) {
      const newToken = this.addWhitespace(token.value.toLowerCase())
      return query + this.equalizeWhitespace(newToken)
    }

    this.indentation.decreaseTopLevel()

    if (prevToken.type === tokenTypes.DBT_END_TEMPLATE) {
      this.indentation.increaseToplevel()
    }

    // Adhere to what the previous token has set on the below condition
    const condition = prevToken.type === tokenTypes.DBT_END_VAR
    query = condition ? query : this.addNewline(query)

    this.indentation.increaseToplevel()

    const newToken = this.upper ? token.value.toUpperCase() : token.value
    query += this.equalizeWhitespace(newToken)
    return this.addNewline(query)
  }

  formatNewlineReservedWord(token: Token, query: string) {
    const newToken = this.upper ? token.value.toUpperCase() : token.value
    return this.addNewline(query) + this.addWhitespace(newToken)
  }

  // Opening parentheses increase the block indent level and start a new line
  formatOpeningParentheses(token: Token, query: string) {
    // Take out the preceding space unless there was whitespace there in the original query
    // or another opening parens or line comment
    const preserveWhitespaceFor = [
      tokenTypes.WHITESPACE,
      tokenTypes.OPEN_PAREN,
      tokenTypes.LINE_COMMENT
    ]
    if (!preserveWhitespaceFor.includes(this.previousToken().type)) {
      query = trimEnd(query)
    }
    query += token.value

    this.inlineBlock.beginIfPossible(this.tokens, this.index)

    if (!this.inlineBlock.isActive()) {
      this.indentation.increaseBlockLevel()
      query = this.addNewline(query)
    }
    return query
  }

  // Closing parentheses decrease the block indent level
  formatClosingParentheses(token: Token, query: string) {
    if (this.inlineBlock.isActive()) {
      this.inlineBlock.end()
      return this.formatWithSpaceAfter(token, query)
    } else {
      this.indentation.decreaseBlockLevel()
      return this.formatWithSpaces(token, this.addNewline(query))
    }
  }

  // Commas start a new line (unless within inline parentheses or SQL "LIMIT" clause)
  formatComma(token: Token, query: string) {
    query = this.trimTrailingWhitespace(query) + token.value + ' '

    if (this.inlineBlock.isActive()) {
      return query
    } else if (/^LIMIT$/i.test(this.previousReservedWord.value)) {
      return query
    } else {
      return this.addNewline(query)
    }
  }

  formatWithSpaceAfter(token: Token, query: string) {
    return this.trimTrailingWhitespace(query) + this.addWhitespace(token.value)
  }

  formatWithoutSpaces(token: Token, query: string) {
    return this.trimTrailingWhitespace(query) + token.value
  }

  formatWithSpaces(token: Token, query: string) {
    return query + this.addWhitespace(token.value)
  }

  formatQuerySeparator(token: Token, query: string) {
    return this.trimTrailingWhitespace(query) + token.value + '\n'
  }
}
