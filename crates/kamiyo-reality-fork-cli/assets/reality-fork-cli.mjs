#!/usr/bin/env node
import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/error.js"(exports) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/argument.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/help.js"(exports) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(
              fullText,
              helpWidth - itemIndentWidth,
              termWidth + itemSeparatorWidth
            );
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.wrap(commandDescription, helpWidth, 0),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(
            helper.argumentTerm(argument),
            helper.argumentDescription(argument)
          );
        });
        if (argumentList.length > 0) {
          output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(
            helper.optionTerm(option),
            helper.optionDescription(option)
          );
        });
        if (optionList.length > 0) {
          output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(
              helper.optionTerm(option),
              helper.optionDescription(option)
            );
          });
          if (globalOptionList.length > 0) {
            output = output.concat([
              "Global Options:",
              formatList(globalOptionList),
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(
            helper.subcommandTerm(cmd2),
            helper.subcommandDescription(cmd2)
          );
        });
        if (commandList.length > 0) {
          output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        return output.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str, width, indent, minColumnWidth = 40) {
        const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
        const manualIndent = new RegExp(`[\\n][${indents}]+`);
        if (str.match(manualIndent)) return str;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth) return str;
        const leadingStr = str.slice(0, indent);
        const columnText = str.slice(indent).replace("\r\n", "\n");
        const indentString = " ".repeat(indent);
        const zeroWidthSpace = "\u200B";
        const breaks = `\\s${zeroWidthSpace}`;
        const regex = new RegExp(
          `
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`,
          "g"
        );
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line, i) => {
          if (line === "\n") return "";
          return (i > 0 ? indentString : "") + line.trimEnd();
        }).join("\n");
      }
    };
    exports.Help = Help2;
  }
});

// node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/option.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
        shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.DualOptions = DualOptions;
  }
});

// node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/suggestSimilar.js"(exports) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/.pnpm/commander@12.1.0/node_modules/commander/lib/command.js"(exports) {
    var EventEmitter = __require("node:events").EventEmitter;
    var childProcess = __require("node:child_process");
    var path5 = __require("node:path");
    var fs6 = __require("node:fs");
    var process4 = __require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str) => process4.stdout.write(str),
          writeErr: (str) => process4.stderr.write(str),
          getOutHelpWidth: () => process4.stdout.isTTY ? process4.stdout.columns : void 0,
          getErrHelpWidth: () => process4.stderr.isTTY ? process4.stderr.columns : void 0,
          outputError: (str, write) => write(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process4.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('-p, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process4.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process4.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process4.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process4.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path5.resolve(baseDir, baseName);
          if (fs6.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path5.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs6.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs6.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path5.resolve(
            path5.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path5.basename(
              this._scriptPath,
              path5.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path5.extname(executableFile));
        let proc;
        if (process4.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process4.execArgv).concat(args);
            proc = childProcess.spawn(process4.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process4.execArgv).concat(args);
          proc = childProcess.spawn(process4.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process4.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process4.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process4.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process4.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process4.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path5.basename(filename, path5.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path6) {
        if (path6 === void 0) return this._executableDir;
        this._executableDir = path6;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write;
        if (context.error) {
          write = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", context);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", context)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process4.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    exports.Command = Command2;
  }
});

// node_modules/.pnpm/commander@12.1.0/node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/.pnpm/commander@12.1.0/node_modules/commander/index.js"(exports) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports.program = new Command2();
    exports.createCommand = (name) => new Command2(name);
    exports.createOption = (flags, description) => new Option2(flags, description);
    exports.createArgument = (name, description) => new Argument2(name, description);
    exports.Command = Command2;
    exports.Option = Option2;
    exports.Argument = Argument2;
    exports.Help = Help2;
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// packages/kamiyo-reality-fork-cli/src/index.ts
import fs5 from "node:fs";
import path4 from "node:path";
import process3 from "node:process";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { execFileSync as execFileSync2 } from "node:child_process";

// packages/kamiyo-reality-fork/dist/index.js
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { promises as fs2 } from "fs";
import os from "os";
import path2 from "path";
function percent2(value) {
  return `${Math.round(value * 100)}%`;
}
function signedPercent(value) {
  const p = Math.round(value * 100);
  if (p > 0) return `+${p}%`;
  if (p < 0) return `${p}%`;
  return "0%";
}
function arrow(direction) {
  if (direction === "up") return "\u25B2";
  if (direction === "down") return "\u25BC";
  return "\u2500";
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function diffLaunchRuns(before, after) {
  const axisMap = new Map(before.axes.map((a) => [a.id, a]));
  const axes = after.axes.map((a) => {
    const prev = axisMap.get(a.id);
    const beforeScore = prev?.score ?? 0;
    const delta = a.score - beforeScore;
    const direction = delta > 5e-3 ? "up" : delta < -5e-3 ? "down" : "flat";
    return {
      id: a.id,
      label: a.label,
      before: beforeScore,
      after: a.score,
      delta,
      direction
    };
  });
  return {
    before: {
      title: before.title,
      generatedAt: before.generatedAt,
      readiness: before.verdict.readiness,
      verdictLabel: before.verdict.label
    },
    after: {
      title: after.title,
      generatedAt: after.generatedAt,
      readiness: after.verdict.readiness,
      verdictLabel: after.verdict.label
    },
    readinessDelta: after.verdict.readiness - before.verdict.readiness,
    verdictChanged: before.verdict.winnerBranchId !== after.verdict.winnerBranchId,
    axes
  };
}
function renderDiffMarkdown(diff) {
  const rows = diff.axes.map(
    (a) => `| ${a.label} | ${percent2(a.before)} | ${percent2(a.after)} | ${signedPercent(a.delta)} ${arrow(a.direction)} |`
  ).join("\n");
  const verdictLine = diff.verdictChanged ? `Verdict changed: **${diff.before.verdictLabel}** \u2192 **${diff.after.verdictLabel}**` : `Verdict unchanged: **${diff.after.verdictLabel}**`;
  return `# Launch Diff

Before: ${diff.before.title} (${diff.before.generatedAt})
After: ${diff.after.title} (${diff.after.generatedAt})

## Readiness

${percent2(diff.before.readiness)} \u2192 ${percent2(diff.after.readiness)} (${signedPercent(diff.readinessDelta)})

${verdictLine}

## Axes

| Axis | Before | After | Delta |
| --- | --- | --- | --- |
${rows}
`;
}
function renderDiffHtml(diff) {
  const rows = diff.axes.map((a) => {
    const cls = a.direction === "up" ? "delta-up" : a.direction === "down" ? "delta-down" : "delta-flat";
    return `<tr>
  <td>${escapeHtml(a.label)}</td>
  <td>${percent2(a.before)}</td>
  <td>${percent2(a.after)}</td>
  <td class="${cls}">${signedPercent(a.delta)} ${arrow(a.direction)}</td>
</tr>`;
  }).join("\n");
  const verdictLine = diff.verdictChanged ? `<strong>${escapeHtml(diff.before.verdictLabel)}</strong> &rarr; <strong>${escapeHtml(diff.after.verdictLabel)}</strong>` : `<strong>${escapeHtml(diff.after.verdictLabel)}</strong> (unchanged)`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Launch Diff</title>
    <style>
      :root {
        --bg: #f4eee1;
        --ink: #1d1913;
        --muted: #615649;
        --panel: rgba(255, 251, 242, 0.9);
        --line: rgba(29, 25, 19, 0.12);
        --accent: #ce5a2c;
        --good: #185b37;
        --bad: #9b2c2c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
        background: var(--bg);
        color: var(--ink);
      }
      main {
        width: min(720px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 48px 0 80px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 28px;
        margin-top: 22px;
      }
      h1 { font-size: 2rem; margin: 0; }
      h2 { font-size: 1.4rem; margin: 0 0 14px; }
      .meta { color: var(--muted); font-size: 0.9rem; margin-top: 8px; }
      .readiness {
        font-size: 2.4rem;
        font-weight: bold;
        font-family: "IBM Plex Mono", Consolas, monospace;
      }
      .readiness-delta { color: var(--accent); font-size: 1.2rem; margin-left: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); }
      th { font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
      td { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 0.95rem; }
      .delta-up { color: var(--good); font-weight: bold; }
      .delta-down { color: var(--bad); font-weight: bold; }
      .delta-flat { color: var(--muted); }
    </style>
  </head>
  <body>
    <main>
      <h1>Launch Diff</h1>
      <p class="meta">${escapeHtml(diff.before.generatedAt)} &rarr; ${escapeHtml(diff.after.generatedAt)}</p>

      <div class="card">
        <h2>Readiness</h2>
        <span class="readiness">${percent2(diff.before.readiness)} &rarr; ${percent2(diff.after.readiness)}</span>
        <span class="readiness-delta">${signedPercent(diff.readinessDelta)}</span>
        <p class="meta" style="margin-top: 14px">${verdictLine}</p>
      </div>

      <div class="card">
        <h2>Axes</h2>
        <table>
          <thead><tr><th>Axis</th><th>Before</th><th>After</th><th>Delta</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </main>
  </body>
</html>`;
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function assertString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}
function assertNumber(value, field) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${field} must be a number`);
  }
}
function assertStringArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be a string array`);
  }
}
function assertReplayEvent(event, index) {
  if (!isRecord(event)) throw new Error(`replay.events[${index}] must be an object`);
  assertString(event.id, `replay.events[${index}].id`);
  assertString(event.eventType, `replay.events[${index}].eventType`);
  assertString(event.phase, `replay.events[${index}].phase`);
  assertString(event.title, `replay.events[${index}].title`);
  assertString(event.description, `replay.events[${index}].description`);
  assertNumber(event.createdAt, `replay.events[${index}].createdAt`);
  assertNumber(event.offsetMs, `replay.events[${index}].offsetMs`);
}
function assertBranch(branch, index) {
  if (!isRecord(branch)) throw new Error(`branches[${index}] must be an object`);
  assertString(branch.branchId, `branches[${index}].branchId`);
  assertString(branch.policyPackId, `branches[${index}].policyPackId`);
  assertString(branch.label, `branches[${index}].label`);
  assertString(branch.summary, `branches[${index}].summary`);
  assertStringArray(branch.evidenceRefs, `branches[${index}].evidenceRefs`);
  assertStringArray(branch.riskFlags, `branches[${index}].riskFlags`);
  assertStringArray(branch.highRiskFlags, `branches[${index}].highRiskFlags`);
  assertStringArray(branch.outputHighlights, `branches[${index}].outputHighlights`);
  for (const field of [
    "score",
    "completionScore",
    "evidenceCoverage",
    "latencyScore",
    "costScore",
    "riskPenalty",
    "latencyMs",
    "totalSpent"
  ]) {
    assertNumber(branch[field], `branches[${index}].${field}`);
  }
}
function assertRealityForkScenario(value) {
  if (!isRecord(value)) throw new Error("scenario must be an object");
  assertString(value.id, "scenario.id");
  assertString(value.slug, "scenario.slug");
  assertString(value.title, "scenario.title");
  assertString(value.tagline, "scenario.tagline");
  assertString(value.summary, "scenario.summary");
  assertString(value.sourceLabel, "scenario.sourceLabel");
  assertString(value.mission, "scenario.mission");
  assertString(value.createdAt, "scenario.createdAt");
  assertString(value.snapshotHash, "scenario.snapshotHash");
  assertStringArray(value.tags, "scenario.tags");
  if (!isRecord(value.snapshot)) throw new Error("scenario.snapshot must be an object");
  assertString(value.snapshot.capturedAt, "scenario.snapshot.capturedAt");
  assertString(value.snapshot.teamId, "scenario.snapshot.teamId");
  assertNumber(value.snapshot.artifactCount, "scenario.snapshot.artifactCount");
  assertStringArray(value.snapshot.artifactRefs, "scenario.snapshot.artifactRefs");
  assertStringArray(value.snapshot.highlights, "scenario.snapshot.highlights");
  if (!Array.isArray(value.branches) || value.branches.length === 0) {
    throw new Error("scenario.branches must be a non-empty array");
  }
  value.branches.forEach(assertBranch);
  if (!isRecord(value.decision)) throw new Error("scenario.decision must be an object");
  assertString(value.decision.winnerReason, "scenario.decision.winnerReason");
  if (!isRecord(value.replay) || !Array.isArray(value.replay.events)) {
    throw new Error("scenario.replay.events must be an array");
  }
  value.replay.events.forEach(assertReplayEvent);
  if (!isRecord(value.shareCard)) throw new Error("scenario.shareCard must be an object");
  assertString(value.shareCard.headline, "scenario.shareCard.headline");
  assertString(value.shareCard.kicker, "scenario.shareCard.kicker");
  assertString(value.shareCard.body, "scenario.shareCard.body");
  assertString(value.shareCard.scoreline, "scenario.shareCard.scoreline");
  assertString(value.shareCard.xPost, "scenario.shareCard.xPost");
  assertStringArray(value.shareCard.bullets, "scenario.shareCard.bullets");
}
function assertRealityForkFixtureBundle(value) {
  if (!isRecord(value)) throw new Error("fixture bundle must be an object");
  if (value.version !== 1) throw new Error("fixture bundle version must be 1");
  assertString(value.generatedAt, "fixture.generatedAt");
  if (!isRecord(value.generator)) throw new Error("fixture.generator must be an object");
  assertString(value.generator.source, "fixture.generator.source");
  assertString(value.generator.teamId, "fixture.generator.teamId");
  assertString(value.generator.caseId, "fixture.generator.caseId");
  assertRealityForkScenario(value.scenario);
}
var here = path.dirname(fileURLToPath(import.meta.url));
var fixturesDir = path.resolve(here, "../fixtures");
async function readFixtureBundle(filePath) {
  const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
  assertRealityForkFixtureBundle(raw);
  return raw;
}
async function listFixtureScenarios() {
  const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
  const bundles = await Promise.all(
    entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => readFixtureBundle(path.join(fixturesDir, entry.name)))
  );
  return bundles.map((bundle) => ({
    id: bundle.scenario.id,
    slug: bundle.scenario.slug,
    title: bundle.scenario.title,
    tagline: bundle.scenario.tagline,
    summary: bundle.scenario.summary,
    tags: bundle.scenario.tags,
    sourceLabel: bundle.scenario.sourceLabel,
    winnerLabel: bundle.scenario.decision.winnerLabel,
    status: bundle.scenario.status
  })).sort(
    (left, right) => left.title.localeCompare(right.title)
  );
}
async function loadFixtureScenario(id) {
  const entries = await fs.readdir(fixturesDir);
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const bundle = await readFixtureBundle(path.join(fixturesDir, entry));
    if (bundle.scenario.id === id || bundle.scenario.slug === id || entry === `${id}.json`) {
      return bundle.scenario;
    }
  }
  throw new Error(`Fixture scenario not found: ${id}`);
}
function fixtureDirectory() {
  return fixturesDir;
}
var WALK_SKIP_DIRS = /* @__PURE__ */ new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target"
]);
var MAX_DOC_BYTES = 24e3;
var MAX_DOC_FILES = 10;
function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
function average(...values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function percent3(value) {
  return `${Math.round(value * 100)}%`;
}
function sanitizePath(value) {
  const home = os.homedir();
  if (value.startsWith(home)) {
    return value.replace(home, "$HOME");
  }
  return value;
}
function compactText2(value, max = 190) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}
function trimPost(value) {
  if (value.length <= 280) return value;
  return `${value.slice(0, 277)}...`;
}
function unique(values) {
  return Array.from(new Set(values));
}
function sample(values, count) {
  return values.slice(0, count);
}
function axisLabel(axis) {
  switch (axis) {
    case "immediacy":
      return "Immediacy";
    case "clarity":
      return "Clarity";
    case "proof":
      return "Proof";
    case "distribution":
      return "Distribution";
    case "shareability":
      return "Shareability";
    case "trust":
      return "Trust";
  }
}
function branchOrder(id) {
  switch (id) {
    case "narrow_launch":
      return 0;
    case "ship_now":
      return 1;
    case "delay_for_proof":
      return 2;
    case "park_it":
      return 3;
  }
}
function summarizeAxis(id, score) {
  switch (id) {
    case "immediacy":
      if (score >= 0.78) {
        return "A builder can reach first value quickly because the repo exposes concrete commands and local material.";
      }
      if (score >= 0.58) {
        return "There is a viable first run, but setup still asks for more context than a breakout launch should.";
      }
      return "First value is still buried behind setup, explanation, or external dependencies.";
    case "clarity":
      if (score >= 0.78) {
        return "The docs lead with a concrete outcome instead of making readers reverse-engineer the point.";
      }
      if (score >= 0.58) {
        return "The story is understandable, but it still leans too hard on features over a single killer use case.";
      }
      return "The public story is still diffuse enough that strangers will ask what the product actually does.";
    case "proof":
      if (score >= 0.78) {
        return "There is enough evidence in the repo to make the product feel like more than a demo.";
      }
      if (score >= 0.58) {
        return "The technical proof is real, but the repo still needs sharper public examples or case studies.";
      }
      return "The repo does not yet provide enough proof that the product changes real decisions.";
    case "distribution":
      if (score >= 0.78) {
        return "Install and update paths are strong enough that distribution will help instead of hurt the product.";
      }
      if (score >= 0.58) {
        return "There is a credible install path, but friction is still visible in packaging or runtime requirements.";
      }
      return "Distribution friction is still high enough to block curiosity before the product can impress anyone.";
    case "shareability":
      if (score >= 0.78) {
        return "Runs produce or imply artifacts that a builder can paste into a thread, doc, or PR without extra work.";
      }
      if (score >= 0.58) {
        return "The product can be explained publicly, but the repo still lacks enough instantly shareable proof objects.";
      }
      return "There is still too little output a builder would want to show another human.";
    case "trust":
      if (score >= 0.78) {
        return "The repo shows enough tests, CI, and release discipline to make strangers less defensive.";
      }
      if (score >= 0.58) {
        return "The repo feels serious, but some release or reliability signals are still missing from the first impression.";
      }
      return "A public launch would force builders to trust the product more than the repo currently earns.";
  }
}
function exec(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
function deriveWebUrl(remoteUrl) {
  if (!remoteUrl) return null;
  const clean = remoteUrl.trim().replace(/\.git$/i, "");
  if (clean.startsWith("https://") || clean.startsWith("http://")) {
    return clean.replace(/\.git$/i, "");
  }
  const sshMatch = clean.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/]([^/]+\/[^/]+)$/);
  if (!sshMatch) {
    return null;
  }
  const host = sshMatch[1];
  const repo = sshMatch[2];
  if (host === "github.com" || host.startsWith("github")) {
    return `https://github.com/${repo}`;
  }
  return `https://${host}/${repo}`;
}
function keepRepoPath(relativePath) {
  return !relativePath.split("/").filter(Boolean).some((segment) => WALK_SKIP_DIRS.has(segment));
}
function isDocPath(relativePath) {
  return /(^|\/)(README|CHANGELOG)(\.[^.]+)?\.md$/i.test(relativePath) || /^docs\/.+\.md$/i.test(relativePath);
}
function isTestPath(relativePath) {
  return /(^|\/)__tests__\//.test(relativePath) || /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|rs|py|go|java|kt)$/i.test(relativePath);
}
function isExamplePath(relativePath) {
  return /(^|\/)(examples?|samples?|demos?)\//i.test(relativePath);
}
function isFixturePath(relativePath) {
  return /(^|\/)fixtures\//i.test(relativePath);
}
function isManifestPath(relativePath) {
  return /(^|\/)(package\.json|Cargo\.toml|pyproject\.toml|go\.mod)$/i.test(relativePath);
}
function isLockPath(relativePath) {
  return /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock|poetry\.lock|uv\.lock|go\.sum)$/i.test(
    relativePath
  );
}
function isCiPath(relativePath) {
  return /^\.github\/workflows\/.+\.(yml|yaml)$/i.test(relativePath) || /^\.gitlab-ci\.yml$/i.test(relativePath) || /^\.circleci\//i.test(relativePath);
}
function isEnvExamplePath(relativePath) {
  return /(^|\/)\.env(\.[^.]+)?\.example$/i.test(relativePath) || /\.env\.example$/i.test(relativePath);
}
function isLicensePath(relativePath) {
  return /(^|\/)LICENSE(\.[^.]+)?$/i.test(relativePath);
}
function isAssetPath(relativePath) {
  return /(^|\/)(assets?|screenshots?|static|public|reports?)\/.+\.(png|jpe?g|gif|svg|webp|html)$/i.test(
    relativePath
  ) || /(report|decision|trace)\.(html|md|json)$/i.test(relativePath);
}
function detectFrameworks(files) {
  const found = [];
  const has = (pattern) => files.some((f) => pattern.test(f));
  if (has(/(^|\/)Anchor\.toml$/)) found.push("solana-anchor");
  else if (has(/(^|\/)programs\/.*\/src\/lib\.rs$/)) found.push("solana-native");
  if (has(/(^|\/)foundry\.toml$/)) found.push("foundry");
  if (has(/(^|\/)hardhat\.config\.(ts|js|cjs|mjs)$/)) found.push("hardhat");
  if (has(/(^|\/)next\.config\.(ts|js|cjs|mjs)$/)) found.push("nextjs");
  if (has(/(^|\/)Dockerfile$/i)) found.push("docker");
  if (has(/(^|\/)turbo\.json$/)) found.push("turborepo");
  if (has(/(^|\/)nx\.json$/)) found.push("nx");
  if (has(/(^|\/)\.github\/workflows\/.+\.ya?ml$/)) found.push("github-actions");
  return found;
}
function isRootSupportPath(relativePath) {
  return isCiPath(relativePath) || !relativePath.includes("/") && (isDocPath(relativePath) || isManifestPath(relativePath) || isLockPath(relativePath) || isEnvExamplePath(relativePath) || isLicensePath(relativePath));
}
function rankDocPath(relativePath) {
  if (/^README(\.[^.]+)?\.md$/i.test(relativePath)) return 0;
  if (/^CHANGELOG(\.[^.]+)?\.md$/i.test(relativePath)) return 1;
  if (/\/README(\.[^.]+)?\.md$/i.test(relativePath)) return 2;
  if (/^docs\//i.test(relativePath)) return 3;
  return 4;
}
async function readTextIfSmall(rootPath, relativePath) {
  try {
    const absolutePath = path2.join(rootPath, relativePath);
    const stat = await fs2.stat(absolutePath);
    if (!stat.isFile() || stat.size > MAX_DOC_BYTES) {
      return null;
    }
    return await fs2.readFile(absolutePath, "utf8");
  } catch {
    return null;
  }
}
async function walkFiles(rootPath, current = "") {
  const directory = path2.join(rootPath, current);
  const entries = await fs2.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = current ? `${current}/${entry.name}` : entry.name;
    if (!keepRepoPath(next)) continue;
    if (entry.isDirectory()) {
      files.push(...await walkFiles(rootPath, next));
      continue;
    }
    if (entry.isFile()) {
      files.push(next);
    }
  }
  return files;
}
async function listRepoFiles(rootPath) {
  const realRootPath = await fs2.realpath(rootPath).catch(() => rootPath);
  const gitRoot = exec("git", ["-C", rootPath, "rev-parse", "--show-toplevel"], rootPath);
  if (!gitRoot) {
    return walkFiles(realRootPath);
  }
  const realGitRoot = await fs2.realpath(gitRoot).catch(() => gitRoot);
  const tracked = exec("git", ["-C", rootPath, "ls-files"], rootPath);
  const others = exec(
    "git",
    ["-C", rootPath, "ls-files", "--others", "--exclude-standard"],
    rootPath
  );
  const gitPrefix = path2.relative(realGitRoot, realRootPath).replace(/\\/g, "/").replace(/^$/, "");
  return unique([...tracked ? tracked.split("\n") : [], ...others ? others.split("\n") : []]).map((item) => item.trim()).filter(Boolean).filter((item) => {
    if (!gitPrefix) return true;
    return item === gitPrefix || item.startsWith(`${gitPrefix}/`);
  }).map((item) => gitPrefix ? item.slice(gitPrefix.length + 1) : item).filter(Boolean).filter(keepRepoPath).sort((left, right) => left.localeCompare(right));
}
function firstParagraph(text) {
  if (!text) return null;
  const blocks = text.split(/\n\s*\n/).map((block) => compactText2(block, 240)).filter((block) => block && !block.startsWith("#") && !block.startsWith("```"));
  return blocks[0] ?? null;
}
function extractCodeBlocks(text) {
  const blocks = [];
  const matcher = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = matcher.exec(text)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}
function extractCommands(docs) {
  const installCommands = [];
  const localRunCommands = [];
  const remoteDependencyNotes = [];
  const runtimeNotes = [];
  const artifactNotes = [];
  for (const doc of docs) {
    for (const block of extractCodeBlocks(doc.text)) {
      for (const rawLine of block.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        if (/^(cargo install|brew install|go install|pip install|uv tool install|npm install -g|pnpm add -g|pnpm dlx|npx)\b/i.test(
          line
        )) {
          installCommands.push(line);
        }
        if (/(^| )(reality-fork|kamiyo-reality-fork-cli)\b/i.test(line) || /^(cargo run|npm run|pnpm run)\b/i.test(line)) {
          localRunCommands.push(line);
        }
      }
    }
    for (const rawLine of doc.text.split("\n")) {
      const line = compactText2(rawLine, 220);
      if (!line) continue;
      if (/\/api\/|remote api|expects a reality fork api|base-url/i.test(line)) {
        remoteDependencyNotes.push(`${doc.path}: ${line}`);
      }
      if (/(Node\.js|node 20|nodejs|cargo install|brew install)/i.test(line)) {
        runtimeNotes.push(`${doc.path}: ${line}`);
      }
      if (/(report\.html|decision\.md|trace\.json|artifact|html report|markdown)/i.test(line)) {
        artifactNotes.push(`${doc.path}: ${line}`);
      }
    }
  }
  return {
    installCommands: unique(installCommands),
    localRunCommands: unique(localRunCommands),
    remoteDependencyNotes: unique(remoteDependencyNotes),
    runtimeNotes: unique(runtimeNotes),
    artifactNotes: unique(artifactNotes)
  };
}
function nonGenericCommandNames(commands) {
  return unique(
    commands.map((command) => command.trim().split(/\s+/)[0]?.toLowerCase() ?? "").filter(Boolean).filter(
      (value) => !["npm", "pnpm", "yarn", "cargo", "python", "uv", "go", "make"].includes(value)
    )
  );
}
function findFocusPaths(docs) {
  const anchors = docs.filter((doc) => doc.path.includes("/")).map((doc) => ({ doc, commands: extractCommands([doc]) })).filter(({ commands }) => {
    const brandedCommands = nonGenericCommandNames(commands.localRunCommands);
    return commands.installCommands.length > 0 && brandedCommands.length > 0;
  });
  if (anchors.length === 0) {
    return [];
  }
  const needles = unique(
    anchors.flatMap(({ doc, commands }) => {
      const commandNames = nonGenericCommandNames(commands.localRunCommands);
      const base = path2.basename(path2.dirname(doc.path)).toLowerCase();
      const baseParts = base.split("-").filter((part) => part.length >= 3);
      const chunks = baseParts.flatMap(
        (part, index) => index < baseParts.length - 1 ? [`${part}-${baseParts[index + 1]}`] : []
      );
      return [base, ...chunks, ...commandNames];
    })
  );
  return unique(
    docs.filter((doc) => needles.some((needle) => doc.path.toLowerCase().includes(needle))).map((doc) => path2.dirname(doc.path).replace(/\\/g, "/"))
  ).sort((left, right) => left.localeCompare(right));
}
function detectLanguages(files) {
  const counts = /* @__PURE__ */ new Map();
  const languageForExt = {
    ".cjs": "JavaScript",
    ".go": "Go",
    ".html": "HTML",
    ".js": "JavaScript",
    ".json": "JSON",
    ".md": "Markdown",
    ".mjs": "JavaScript",
    ".py": "Python",
    ".rs": "Rust",
    ".sh": "Shell",
    ".toml": "TOML",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".yaml": "YAML",
    ".yml": "YAML"
  };
  for (const file of files) {
    const ext = path2.extname(file).toLowerCase();
    const language = languageForExt[ext];
    if (!language) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, fileCount]) => ({ name, fileCount })).sort((left, right) => right.fileCount - left.fileCount || left.name.localeCompare(right.name)).slice(0, 6);
}
function repoNameFromSignals(rootPath, remoteUrl, docs) {
  const webUrl = deriveWebUrl(remoteUrl);
  if (webUrl) {
    const tail = webUrl.split("/").filter(Boolean).pop();
    if (tail) return tail;
  }
  for (const doc of docs) {
    const heading = doc.text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (heading) return heading.replace(/`/g, "");
  }
  return path2.basename(rootPath);
}
function buildSignals(repo, scores, axes) {
  const signals = [];
  const push = (id, type, axis, statement, detail, weight, citations, inferred = false) => {
    signals.push({ id, type, axis, statement, detail, weight, citations, inferred });
  };
  if (repo.installCommands.length > 0 || repo.localRunCommands.length > 0) {
    push(
      "doc-commands",
      "supporting",
      "immediacy",
      "Docs expose concrete commands instead of forcing builders to start from source.",
      `Found ${repo.installCommands.length} install commands and ${repo.localRunCommands.length} run commands in the docs.`,
      0.88,
      sample([repo.readmePath, ...repo.docs].filter(Boolean), 3)
    );
  }
  if (repo.examples.length + repo.fixtures.length > 0) {
    push(
      "local-material",
      "supporting",
      "shareability",
      "The repo already contains local material a builder can touch on the first run.",
      `Found ${repo.examples.length} example paths and ${repo.fixtures.length} fixture paths.`,
      0.81,
      sample([...repo.examples, ...repo.fixtures], 4)
    );
  }
  if (repo.tests.length > 0) {
    push(
      "tests-present",
      "supporting",
      "proof",
      "The repo carries technical proof instead of pure positioning.",
      `Found ${repo.tests.length} test files in the scanned tree.`,
      0.86,
      sample(repo.tests, 4)
    );
  }
  if (repo.ci.length > 0) {
    push(
      "ci-present",
      "supporting",
      "trust",
      "Release discipline is visible from the repo surface.",
      `Found ${repo.ci.length} CI configuration files.`,
      0.73,
      sample(repo.ci, 3)
    );
  }
  if (repo.git.changedFiles.length === 0 && repo.git.commit) {
    push(
      "clean-tree",
      "supporting",
      "trust",
      "The working tree is clean at the time of analysis.",
      `No uncommitted changes were detected on ${repo.git.branch ?? "the current branch"}.`,
      0.62,
      ["git:status"]
    );
  }
  if (repo.licenses.length > 0) {
    push(
      "license-present",
      "supporting",
      "trust",
      "The repo includes an explicit license surface.",
      `Found ${repo.licenses.length} license file${repo.licenses.length === 1 ? "" : "s"}.`,
      0.58,
      sample(repo.licenses, 2)
    );
  }
  if (repo.frameworks.length > 0) {
    const solana = repo.frameworks.filter((f) => f.startsWith("solana"));
    const label = solana.length > 0 ? `Solana ecosystem detected (${solana.join(", ")})` : `Recognized frameworks: ${repo.frameworks.join(", ")}`;
    push(
      "framework-detected",
      "supporting",
      "distribution",
      label,
      `Detected ${repo.frameworks.length} framework${repo.frameworks.length === 1 ? "" : "s"} from project markers.`,
      solana.length > 0 ? 0.85 : 0.78,
      []
    );
  }
  if (repo.remoteDependencyNotes.length > 0) {
    push(
      "remote-dependency",
      "risk",
      "immediacy",
      "Advanced flows still depend on a separate API surface.",
      compactText2(repo.remoteDependencyNotes[0], 180),
      0.93,
      sample(
        repo.remoteDependencyNotes.map((note) => note.split(": ")[0]),
        3
      )
    );
  }
  if (scores.splitRuntimePenalty > 0) {
    push(
      "split-runtime",
      "risk",
      "distribution",
      "The public install path still exposes multi-runtime friction.",
      "The docs mention Cargo install and a Node runtime requirement together.",
      0.89,
      sample(
        repo.runtimeNotes.map((note) => note.split(": ")[0]),
        3
      )
    );
  }
  if (repo.git.changedFiles.length > 0) {
    push(
      "dirty-tree",
      "risk",
      "trust",
      "The repo is not launch-clean right now.",
      `${repo.git.changedFiles.length} changed file${repo.git.changedFiles.length === 1 ? "" : "s"} were detected in git status.`,
      0.77,
      ["git:status"]
    );
  }
  const shareability = axes.find((axis) => axis.id === "shareability")?.score ?? 0;
  if (shareability < 0.66) {
    push(
      "artifact-gap",
      "risk",
      "shareability",
      "The repo still lacks enough instantly shareable proof objects.",
      "There are not yet enough visible report, screenshot, or public artifact cues in the repo surface.",
      0.84,
      sample([repo.readmePath, ...repo.assets].filter(Boolean), 3),
      true
    );
  }
  const clarity = axes.find((axis) => axis.id === "clarity")?.score ?? 0;
  if (clarity < 0.68) {
    push(
      "story-gap",
      "risk",
      "clarity",
      "The public story still reads weaker than the underlying engineering.",
      "The docs expose commands and features, but the breakout user outcome is still not obvious enough.",
      0.82,
      sample([repo.readmePath, ...repo.docs].filter(Boolean), 3),
      true
    );
  }
  const proof = axes.find((axis) => axis.id === "proof")?.score ?? 0;
  if (proof < 0.62) {
    push(
      "proof-gap",
      "risk",
      "proof",
      "The repo still needs more public proof that the product changes decisions.",
      "Tests alone do not create external demand; case studies and concrete caught-failures are still missing.",
      0.78,
      sample(repo.tests, 3),
      true
    );
  }
  return signals.sort(
    (left, right) => right.weight - left.weight || left.id.localeCompare(right.id)
  );
}
function buildActions(axes) {
  const actionsByAxis = {
    immediacy: "Make one zero-config flow the public front door. If it needs a backend, ship a local mode or a public demo endpoint.",
    clarity: "Rewrite the README and launch copy around one user outcome, not the full command inventory.",
    proof: "Publish three real cases where the product changed a ship or no-ship decision.",
    distribution: "Pick one primary install path and demote extra runtime friction to the background.",
    shareability: "Emit HTML, Markdown, and JSON artifacts by default and give people a screenshot-worthy report.",
    trust: "Surface tests, CI, and hard runtime requirements in the first screen of the docs."
  };
  const weakest = axes.slice().sort((left, right) => left.score - right.score || left.id.localeCompare(right.id)).filter((axis) => axis.score < 0.76).map((axis) => actionsByAxis[axis.id]);
  if (weakest.length > 0) {
    return unique(weakest).slice(0, 4);
  }
  return [
    "Record a 90-second repo-to-report demo and pin it next to the install command.",
    "Ship a GitHub Action or PR comment flow so the product lands inside existing builder habits.",
    "Collect five external runs and turn the strongest one into a public case study."
  ];
}
function buildBranches2(axes, actions, repo) {
  const scores = Object.fromEntries(axes.map((axis) => [axis.id, axis.score]));
  const readiness = average(...axes.map((axis) => axis.score));
  const strength = average(scores.immediacy, scores.proof, scores.trust);
  const weakestGoToMarket = Math.min(scores.clarity, scores.distribution, scores.shareability);
  const branchScores = {
    ship_now: clamp(0.55 * readiness + 0.25 * weakestGoToMarket + 0.2 * strength),
    narrow_launch: clamp(
      0.35 * strength + 0.25 * scores.immediacy + 0.2 * scores.clarity + 0.2 * (1 - weakestGoToMarket)
    ),
    delay_for_proof: clamp(
      0.4 * (1 - average(scores.proof, scores.trust)) + 0.2 * (1 - scores.distribution) + 0.2 * (1 - scores.shareability) + 0.2 * (1 - scores.clarity)
    ),
    park_it: clamp(
      0.55 * (1 - readiness) + 0.25 * (1 - average(scores.clarity, scores.trust)) + 0.2 * (1 - scores.proof)
    )
  };
  const branches = [
    {
      id: "ship_now",
      label: "Launch the current product now",
      stance: "Broad launch",
      score: branchScores.ship_now,
      summary: "Launch the full current surface now and learn in public without another major packaging pass.",
      advantages: [
        `Immediacy is already at ${percent3(scores.immediacy)}.`,
        `Trust and proof together average ${percent3(average(scores.trust, scores.proof))}.`,
        "You get real external signal immediately instead of optimizing in a vacuum."
      ],
      risks: [
        `The weakest go-to-market axis is still only ${percent3(weakestGoToMarket)}.`,
        "You will spend launch energy explaining the product instead of showing one impossible-to-miss use case."
      ],
      nextMoves: [
        "Lead with the generated report artifact, not the command list.",
        "Record one repo-to-report walkthrough before the announcement thread.",
        "Treat the first five external runs as message refinement, not validation theater."
      ]
    },
    {
      id: "narrow_launch",
      label: "Launch one impossible-to-miss workflow",
      stance: "Flagship launch",
      score: branchScores.narrow_launch,
      summary: "Make one repo-native workflow the product, and demote everything else to supporting machinery.",
      advantages: [
        `Core strength is already ${percent3(strength)} across immediacy, proof, and trust.`,
        "You can force the public story to match the strongest technical surface.",
        "The HTML, Markdown, and JSON artifact path becomes the thing people remember and share."
      ],
      risks: [
        "You have to cut or hide commands that do not reinforce the flagship path.",
        "Breadth will look smaller at launch, even if the product is stronger."
      ],
      nextMoves: [
        `Make \`reality-fork run launch --repo .\` the front door for ${repo.name}.`,
        "Move secondary commands below the flagship workflow in docs and posts.",
        actions[0] ?? "Ship one public case study built from a real run artifact."
      ]
    },
    {
      id: "delay_for_proof",
      label: "Delay and harden",
      stance: "Proof-first",
      score: branchScores.delay_for_proof,
      summary: "Hold the broad public launch until the product has stronger external proof, packaging, and trust signals.",
      advantages: [
        "You avoid burning audience attention on a message that still needs another pass.",
        "You buy time to turn strong internals into undeniable public proof."
      ],
      risks: [
        "Momentum cools off if the hardening phase drifts without a deadline.",
        "The team may hide behind polish work instead of confronting the product wedge."
      ],
      nextMoves: [
        actions[0] ?? "Close the weakest public axis first.",
        actions[1] ?? "Publish a real case study before reopening launch planning.",
        "Set a brutal ship gate: if a builder is not impressed in three minutes, the launch is still early."
      ]
    },
    {
      id: "park_it",
      label: "Park the product",
      stance: "No launch",
      score: branchScores.park_it,
      summary: "Stop spending launch calories until the wedge is sharper and the product earns attention on first contact.",
      advantages: [
        "You avoid a weak public story calcifying around the project.",
        "The team can extract the strongest primitives without pretending they are already a product."
      ],
      risks: [
        "You lose external learning entirely for this cycle.",
        "The product can become a permanent internal tool if there is no return date."
      ],
      nextMoves: [
        "Freeze launch work and write down the one future use case worth reviving.",
        "Keep only the primitives that support that wedge.",
        "Reopen launch planning only when the first-run artifact is strong enough to post without apology."
      ]
    }
  ];
  return branches.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return branchOrder(left.id) - branchOrder(right.id);
  });
}
function verdictReason(branch, axes, actions) {
  const strengths = axes.slice().sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, 2).map((axis) => axisLabel(axis.id).toLowerCase());
  const weakest = axes.slice().sort((left, right) => left.score - right.score || left.id.localeCompare(right.id)).slice(0, 2).map((axis) => axisLabel(axis.id).toLowerCase());
  switch (branch.id) {
    case "ship_now":
      return `The weakest outward-facing axis is strong enough to support a broad launch, and the repo already shows real ${strengths.join(
        " and "
      )}.`;
    case "narrow_launch":
      return `The core engine is credible, but the strongest external story is still one flagship workflow. ${actions[0] ?? "Lead with one impossible-to-miss path."}`;
    case "delay_for_proof":
      return `The current repo is still too weak on ${weakest.join(
        " and "
      )} for a broad public push. Shipping now would create more confusion than pull.`;
    case "park_it":
      return `The wedge is not sharp enough yet. The repo is still weakest on ${weakest.join(
        " and "
      )}, so launch work would mostly be noise.`;
  }
}
function buildPosts(repo, branch, verdict, axes) {
  const topAxes = axes.slice().sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, 2).map((axis) => `${axisLabel(axis.id)} ${percent3(axis.score)}`);
  const weakAxes = axes.slice().sort((left, right) => left.score - right.score || left.id.localeCompare(right.id)).slice(0, 2).map((axis) => `${axisLabel(axis.id)} ${percent3(axis.score)}`);
  return {
    announcement: trimPost(
      [
        `Reality Fork launch verdict for ${repo.name}: ${branch.label}.`,
        verdict.reason,
        `Top signals: ${topAxes.join(" | ")}.`
      ].join(" ")
    ),
    thread: [
      trimPost(
        `Reality Fork scored ${repo.name} at ${percent3(verdict.readiness)} launch readiness. Verdict: ${branch.label}.`
      ),
      trimPost(`Strongest signals: ${topAxes.join(" | ")}. Weakest: ${weakAxes.join(" | ")}.`),
      trimPost(`Next move: ${branch.nextMoves[0]}`)
    ]
  };
}
function citationLink(repo, citation) {
  if (!repo.git.webUrl || !repo.git.commit) return null;
  if (citation.startsWith("git:")) return null;
  return `${repo.git.webUrl}/blob/${repo.git.commit}/${citation}`;
}
function formatMarkdownCitation(repo, citation) {
  const link = citationLink(repo, citation);
  if (!link) return `\`${citation}\``;
  return `[\`${citation}\`](${link})`;
}
function escapeHtml2(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatHtmlCitation(repo, citation) {
  const link = citationLink(repo, citation);
  if (!link) return `<code>${escapeHtml2(citation)}</code>`;
  return `<a href="${escapeHtml2(link)}"><code>${escapeHtml2(citation)}</code></a>`;
}
function renderDecisionMarkdown(run) {
  const branch = run.branches[0];
  const scoreboard = run.axes.map((axis) => `| ${axisLabel(axis.id)} | ${percent3(axis.score)} | ${axis.summary} |`).join("\n");
  const branchSections = run.branches.map(
    (item) => `### ${item.label}

Score: ${percent3(item.score)}

${item.summary}

Advantages:
- ${item.advantages.join("\n- ")}

Risks:
- ${item.risks.join("\n- ")}

Next moves:
- ${item.nextMoves.join("\n- ")}`
  ).join("\n\n");
  const signals = run.signals.map((signal) => {
    const citations = signal.citations.length ? `
Citations: ${signal.citations.map((citation) => formatMarkdownCitation(run.repo, citation)).join(", ")}` : "";
    const inference = signal.inferred ? " (inference)" : "";
    return `- **${signal.type.toUpperCase()} / ${axisLabel(signal.axis)}** ${signal.statement}${inference}
  ${signal.detail}${citations}`;
  }).join("\n");
  return `# ${run.title}

Generated: ${run.generatedAt}

Repo: ${run.repo.name}
Path: \`${run.repo.displayPath}\`
Prompt: ${run.prompt}

## Verdict

**${branch.label}**

${run.verdict.reason}

Launch readiness: ${percent3(run.verdict.readiness)}

## Scoreboard

| Axis | Score | Read |
| --- | --- | --- |
${scoreboard}

## Branches Compared

${branchSections}

## Evidence

${signals}

## Next Moves

- ${run.actions.join("\n- ")}

## Ready X Posts

Announcement:

> ${run.posts.announcement}

Thread:

1. ${run.posts.thread[0]}
2. ${run.posts.thread[1]}
3. ${run.posts.thread[2]}
`;
}
function renderReportHtml(run) {
  const winner = run.branches[0];
  const signals = run.signals.map((signal) => {
    const citations = signal.citations.length ? `<div class="signal-citations">${signal.citations.map((citation) => formatHtmlCitation(run.repo, citation)).join(" ")}</div>` : "";
    return `<article class="signal signal-${signal.type}">
  <div class="signal-meta">${escapeHtml2(signal.type)} \xB7 ${escapeHtml2(axisLabel(signal.axis))}${signal.inferred ? " \xB7 inference" : ""}</div>
  <h3>${escapeHtml2(signal.statement)}</h3>
  <p>${escapeHtml2(signal.detail)}</p>
  ${citations}
</article>`;
  }).join("\n");
  const branches = run.branches.map(
    (branch) => `<article class="branch ${branch.id === winner.id ? "branch-winner" : ""}">
  <div class="branch-score">${percent3(branch.score)}</div>
  <div class="branch-stance">${escapeHtml2(branch.stance)}</div>
  <h3>${escapeHtml2(branch.label)}</h3>
  <p>${escapeHtml2(branch.summary)}</p>
  <details open>
    <summary>Details</summary>
    <div class="branch-columns">
      <section>
        <h4>Advantages</h4>
        <ul>${branch.advantages.map((item) => `<li>${escapeHtml2(item)}</li>`).join("")}</ul>
      </section>
      <section>
        <h4>Risks</h4>
        <ul>${branch.risks.map((item) => `<li>${escapeHtml2(item)}</li>`).join("")}</ul>
      </section>
    </div>
    <section>
      <h4>Next Moves</h4>
      <ul>${branch.nextMoves.map((item) => `<li>${escapeHtml2(item)}</li>`).join("")}</ul>
    </section>
  </details>
</article>`
  ).join("\n");
  const axes = run.axes.map(
    (axis) => `<article class="axis-card">
  <div class="axis-header">
    <h3>${escapeHtml2(axisLabel(axis.id))}</h3>
    <span>${percent3(axis.score)}</span>
  </div>
  <div class="axis-bar"><span data-width="${Math.round(axis.score * 100)}%" style="width: 0"></span></div>
  <p>${escapeHtml2(axis.summary)}</p>
</article>`
  ).join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml2(run.title)}</title>
    <style>
      :root {
        --bg: #f4eee1;
        --bg-alt: #fff8ec;
        --ink: #1d1913;
        --muted: #615649;
        --panel: rgba(255, 251, 242, 0.9);
        --line: rgba(29, 25, 19, 0.12);
        --accent: #ce5a2c;
        --accent-soft: rgba(206, 90, 44, 0.18);
        --good: #185b37;
        --bad: #9b2c2c;
        --shadow: 0 24px 80px rgba(58, 35, 14, 0.12);
        --card-bg: rgba(255, 255, 255, 0.64);
      }

      html.dark {
        --bg: #141210;
        --bg-alt: #1a1714;
        --ink: #e8e0d4;
        --muted: #9a8e80;
        --panel: rgba(28, 24, 20, 0.92);
        --line: rgba(232, 224, 212, 0.1);
        --accent: #e8784a;
        --accent-soft: rgba(232, 120, 74, 0.16);
        --good: #3db872;
        --bad: #e25a5a;
        --shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
        --card-bg: rgba(255, 255, 255, 0.04);
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        background:
          radial-gradient(circle at top left, rgba(206, 90, 44, 0.16), transparent 32%),
          radial-gradient(circle at top right, rgba(24, 91, 55, 0.14), transparent 28%),
          linear-gradient(180deg, var(--bg), var(--bg-alt));
        color: var(--ink);
        transition: background 0.3s, color 0.3s;
      }

      main {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 48px 0 80px;
      }

      .hero, .section, .posts {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
        transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
      }

      .hero {
        padding: 40px;
        overflow: hidden;
        position: relative;
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -120px -120px auto;
        width: 320px;
        height: 320px;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(206, 90, 44, 0.14), rgba(24, 91, 55, 0.12));
      }

      .mono, .kicker, .signal-meta, .branch-stance, .repo-meta,
      .axis-header span, .branch-score, .posts code, .btn {
        font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
      }

      .kicker {
        display: inline-flex;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 12px;
      }

      .hero-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .btn {
        cursor: pointer;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--card-bg);
        color: var(--muted);
        padding: 6px 14px;
        font-size: 12px;
        letter-spacing: 0.04em;
        transition: background 0.2s, color 0.2s;
      }
      .btn:hover { color: var(--ink); }

      h1, h2, h3, h4, p { margin: 0; }

      h1 {
        margin-top: 18px;
        font-size: clamp(2.5rem, 6vw, 4.8rem);
        line-height: 0.94;
        max-width: 11ch;
      }

      .hero-copy { max-width: 760px; }

      .hero-copy p {
        margin-top: 20px;
        font-size: 1.12rem;
        line-height: 1.65;
        color: var(--muted);
      }

      .hero-grid, .axis-grid, .branch-grid, .signal-grid, .posts-grid {
        display: grid;
        gap: 18px;
      }

      .hero-grid {
        grid-template-columns: 1.6fr 1fr;
        margin-top: 32px;
      }

      .hero-stat, .axis-card, .branch, .signal, .posts article {
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 22px;
        background: var(--card-bg);
        transition: background 0.3s, border-color 0.3s;
      }

      .hero-stat strong {
        display: block;
        font-size: 2rem;
        margin-top: 6px;
      }

      .hero-stat span, .repo-meta { color: var(--muted); }

      .repo-meta {
        margin-top: 28px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px 18px;
        font-size: 0.9rem;
      }

      .section, .posts {
        margin-top: 22px;
        padding: 30px;
        opacity: 0;
        transform: translateY(24px);
        animation: fadeInUp 0.5s ease forwards;
      }
      .section:nth-child(2) { animation-delay: 0.1s; }
      .section:nth-child(3) { animation-delay: 0.2s; }
      .section:nth-child(4) { animation-delay: 0.3s; }
      .section:nth-child(5) { animation-delay: 0.4s; }
      .posts { animation-delay: 0.5s; }

      @keyframes fadeInUp {
        to { opacity: 1; transform: translateY(0); }
      }

      .section h2, .posts h2 {
        font-size: 1.75rem;
        margin-bottom: 18px;
      }

      .axis-grid {
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      }

      .axis-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
      }

      .axis-bar {
        height: 10px;
        border-radius: 999px;
        background: rgba(29, 25, 19, 0.08);
        overflow: hidden;
        margin: 14px 0;
      }
      html.dark .axis-bar { background: rgba(232, 224, 212, 0.08); }

      .axis-bar span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--accent), var(--good));
        transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .axis-card p, .signal p, .branch p, .posts p {
        color: var(--muted);
        line-height: 1.6;
      }

      .branch-grid {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .branch { position: relative; }

      .branch-winner {
        border-color: rgba(206, 90, 44, 0.35);
        background: linear-gradient(180deg, rgba(206, 90, 44, 0.08), var(--card-bg));
      }

      .branch-score {
        color: var(--accent);
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .branch h3 { margin-top: 8px; font-size: 1.35rem; }

      .branch-columns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
        margin-top: 18px;
      }

      .branch section:last-child { margin-top: 18px; }

      details summary {
        cursor: pointer;
        margin-top: 12px;
        color: var(--muted);
        font-size: 0.9rem;
      }
      details summary::marker { color: var(--accent); }

      ul {
        margin: 12px 0 0;
        padding-left: 18px;
        color: var(--muted);
        line-height: 1.6;
      }

      .signal-grid {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .signal-supporting { border-color: rgba(24, 91, 55, 0.18); }
      .signal-risk { border-color: rgba(155, 44, 44, 0.18); }

      .signal-meta {
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .signal h3 { margin: 10px 0 8px; font-size: 1.15rem; }

      .signal-citations {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }

      a { color: inherit; }

      code {
        font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
        font-size: 0.9em;
        background: rgba(29, 25, 19, 0.05);
        padding: 3px 6px;
        border-radius: 8px;
      }
      html.dark code { background: rgba(232, 224, 212, 0.06); }

      .posts-grid {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .posts article { position: relative; }
      .posts article h3 { font-size: 1rem; margin-bottom: 10px; }

      .copy-btn {
        position: absolute;
        top: 14px;
        right: 14px;
      }

      .actions { display: grid; gap: 12px; }

      .actions article {
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: var(--card-bg);
        transition: background 0.3s, border-color 0.3s;
      }

      @media (max-width: 860px) {
        .hero-grid, .branch-columns { grid-template-columns: 1fr; }
        main { width: min(100vw - 24px, 1120px); padding-top: 24px; }
        .hero, .section, .posts { padding: 22px; border-radius: 22px; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="hero-bar">
          <span class="kicker">Reality Fork Launch Run</span>
          <button class="btn" id="theme-toggle" type="button">dark mode</button>
        </div>
        <div class="hero-copy">
          <h1>${escapeHtml2(winner.label)}</h1>
          <p>${escapeHtml2(run.verdict.reason)}</p>
          <div class="repo-meta">
            <span>${escapeHtml2(run.repo.name)}</span>
            <span>${escapeHtml2(run.repo.displayPath)}</span>
            <span>${escapeHtml2(run.generatedAt)}</span>
            <span>readiness ${percent3(run.verdict.readiness)}</span>
          </div>
        </div>
        <div class="hero-grid">
          <article class="hero-stat">
            <span>Prompt</span>
            <strong>${escapeHtml2(run.prompt)}</strong>
          </article>
          <article class="hero-stat">
            <span>Winner score</span>
            <strong>${percent3(winner.score)}</strong>
          </article>
        </div>
      </section>

      <section class="section">
        <h2>Scoreboard</h2>
        <div class="axis-grid">
          ${axes}
        </div>
      </section>

      <section class="section">
        <h2>Branches Compared</h2>
        <div class="branch-grid">
          ${branches}
        </div>
      </section>

      <section class="section">
        <h2>Evidence</h2>
        <div class="signal-grid">
          ${signals}
        </div>
      </section>

      <section class="section">
        <h2>Next Moves</h2>
        <div class="actions">
          ${run.actions.map((action) => `<article>${escapeHtml2(action)}</article>`).join("\n")}
        </div>
      </section>

      <section class="posts">
        <h2>Ready Posts</h2>
        <div class="posts-grid">
          <article>
            <button class="btn copy-btn" type="button" data-copy="${escapeHtml2(run.posts.announcement)}">copy</button>
            <h3>Announcement</h3>
            <p>${escapeHtml2(run.posts.announcement)}</p>
          </article>
          <article>
            <button class="btn copy-btn" type="button" data-copy="${escapeHtml2(run.posts.thread.join("\n"))}">copy</button>
            <h3>Thread</h3>
            <p>1. ${escapeHtml2(run.posts.thread[0])}</p>
            <p>2. ${escapeHtml2(run.posts.thread[1])}</p>
            <p>3. ${escapeHtml2(run.posts.thread[2])}</p>
          </article>
        </div>
      </section>
    </main>
    <script>
      (function () {
        var bars = document.querySelectorAll('.axis-bar span[data-width]');
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            bars.forEach(function (bar) { bar.style.width = bar.dataset.width; });
          });
        });

        var toggle = document.getElementById('theme-toggle');
        function applyTheme(dark) {
          document.documentElement.classList.toggle('dark', dark);
          toggle.textContent = dark ? 'light mode' : 'dark mode';
          try { localStorage.setItem('rf-theme', dark ? 'dark' : 'light'); } catch (_) {}
        }
        try {
          var saved = localStorage.getItem('rf-theme');
          if (saved === 'dark') applyTheme(true);
          else if (!saved && matchMedia('(prefers-color-scheme: dark)').matches) applyTheme(true);
        } catch (_) {}
        toggle.addEventListener('click', function () {
          applyTheme(!document.documentElement.classList.contains('dark'));
        });

        document.querySelectorAll('[data-copy]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var text = btn.dataset.copy;
            navigator.clipboard.writeText(text).then(function () {
              var prev = btn.textContent;
              btn.textContent = 'copied';
              setTimeout(function () { btn.textContent = prev; }, 1200);
            });
          });
        });
      })();
    </script>
  </body>
</html>`;
}
function tracePayload(run) {
  return {
    kind: run.kind,
    version: run.version,
    generatedAt: run.generatedAt,
    title: run.title,
    prompt: run.prompt,
    repo: run.repo,
    axes: run.axes,
    signals: run.signals,
    branches: run.branches,
    verdict: run.verdict,
    actions: run.actions,
    posts: run.posts
  };
}
async function collectRepoContext(rootPath, requestedFocusPaths = []) {
  const allFiles = await listRepoFiles(rootPath);
  const discoveryDocs = allFiles.filter(isDocPath).slice().sort((left, right) => rankDocPath(left) - rankDocPath(right) || left.localeCompare(right)).slice(0, Math.max(MAX_DOC_FILES, 80));
  const discoverySources = (await Promise.all(
    discoveryDocs.map(async (docPath) => {
      const text = await readTextIfSmall(rootPath, docPath);
      return text ? { path: docPath, text } : null;
    })
  )).filter((value) => Boolean(value));
  const focusPaths = requestedFocusPaths.length > 0 ? unique(
    requestedFocusPaths.map((item) => path2.relative(rootPath, path2.resolve(rootPath, item)).replace(/\\/g, "/")).map((item) => item.replace(/^\.\/?/, "")).filter(Boolean)
  ) : findFocusPaths(discoverySources);
  const files = focusPaths.length === 0 ? allFiles : allFiles.filter(
    (file) => isRootSupportPath(file) || focusPaths.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))
  );
  const docs = files.filter(isDocPath);
  const tests = files.filter(isTestPath);
  const examples = files.filter(isExamplePath);
  const fixtures = files.filter(isFixturePath);
  const manifests = files.filter(isManifestPath);
  const locks = files.filter(isLockPath);
  const ci = files.filter(isCiPath);
  const envExamples = files.filter(isEnvExamplePath);
  const licenses = files.filter(isLicensePath);
  const assets = files.filter(isAssetPath);
  const docsToRead = docs.slice().sort((left, right) => rankDocPath(left) - rankDocPath(right) || left.localeCompare(right)).slice(0, MAX_DOC_FILES);
  const docSources = (await Promise.all(
    docsToRead.map(async (docPath) => {
      const text = await readTextIfSmall(rootPath, docPath);
      return text ? { path: docPath, text } : null;
    })
  )).filter((value) => Boolean(value));
  const commandSignals = extractCommands(docSources);
  const branch = exec("git", ["-C", rootPath, "rev-parse", "--abbrev-ref", "HEAD"], rootPath);
  const commit = exec("git", ["-C", rootPath, "rev-parse", "--short", "HEAD"], rootPath);
  const rawRemoteUrl = exec("git", ["-C", rootPath, "remote", "get-url", "origin"], rootPath);
  const webUrl = deriveWebUrl(rawRemoteUrl);
  const recentCommits = (exec("git", ["-C", rootPath, "log", "--pretty=%s", "-n", "6"], rootPath) ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const changedFiles = (exec("git", ["-C", rootPath, "status", "--short", "--untracked-files=normal"], rootPath) ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const readmePath = docs.find((file) => /^README(\.[^.]+)?\.md$/i.test(file)) ?? null;
  const readmeText = readmePath ? docSources.find((source) => source.path === readmePath)?.text ?? null : null;
  const name = repoNameFromSignals(rootPath, rawRemoteUrl, docSources);
  const frameworks = detectFrameworks(allFiles);
  return {
    name,
    displayPath: sanitizePath(rootPath),
    fileCount: files.length,
    focusPaths,
    readmePath,
    readmeExcerpt: firstParagraph(readmeText),
    docs,
    tests,
    examples,
    fixtures,
    manifests,
    locks,
    ci,
    envExamples,
    licenses,
    assets,
    frameworks,
    installCommands: commandSignals.installCommands,
    localRunCommands: commandSignals.localRunCommands,
    remoteDependencyNotes: commandSignals.remoteDependencyNotes,
    runtimeNotes: commandSignals.runtimeNotes,
    artifactNotes: commandSignals.artifactNotes,
    languages: detectLanguages(files),
    git: {
      branch,
      commit,
      remoteUrl: rawRemoteUrl,
      webUrl,
      changedFiles,
      recentCommits
    }
  };
}
function deriveRepoScores(repo) {
  const hasReadme = repo.readmePath ? 1 : 0;
  const docsScore = clamp(repo.docs.length / 8);
  const commandDocsScore = clamp((repo.installCommands.length + repo.localRunCommands.length) / 6);
  const installScore = repo.installCommands.length > 0 ? clamp(0.6 + repo.installCommands.length / 8) : repo.manifests.length > 0 ? 0.35 : 0;
  const localModeScore = repo.localRunCommands.some((command) => !/^curl\b/i.test(command)) && (repo.fixtures.length > 0 || repo.examples.length > 0 || repo.remoteDependencyNotes.length < repo.localRunCommands.length) ? 1 : repo.fixtures.length > 0 || repo.examples.length > 0 ? 0.72 : 0.22;
  const docText = [
    repo.readmeExcerpt ?? "",
    ...repo.artifactNotes,
    ...repo.remoteDependencyNotes
  ].join(" ");
  const outcomeHits = (docText.match(
    /\b(launch|ship|deploy|review|simulate|stress-test|decision|workflow|agent|builder|artifact|report|pr|spec)\b/gi
  ) ?? []).length;
  const artifactTextHits = (docText.match(/\b(report|artifact|decision|trace|html|markdown)\b/gi) ?? []).length;
  const exampleScore = clamp((repo.examples.length + repo.fixtures.length) / 6);
  const artifactScore = repo.assets.length > 0 || repo.artifactNotes.length > 0 ? clamp(0.55 + (repo.assets.length + repo.artifactNotes.length) / 8) : 0;
  const proofScore = clamp(repo.tests.length / 10);
  const ciScore = repo.ci.length > 0 ? 1 : 0;
  const commitScore = clamp(repo.git.recentCommits.length / 6);
  const manifestScore = clamp(repo.manifests.length / 4);
  const lockScore = clamp(repo.locks.length / 4);
  const changelogScore = repo.docs.some((file) => /^CHANGELOG/i.test(path2.basename(file))) ? 1 : 0;
  const cleanScore = repo.git.branch === null ? 0.7 : repo.git.changedFiles.length === 0 ? 1 : clamp(1 - repo.git.changedFiles.length / 28);
  const licenseScore = repo.licenses.length > 0 ? 1 : 0;
  const envScore = repo.envExamples.length > 0 ? 1 : 0;
  const mentionsCargoInstall = repo.installCommands.some(
    (command) => /^cargo install\b/i.test(command)
  );
  const mentionsNodeRequirement = repo.runtimeNotes.some(
    (note) => /Node\.js|node 20|nodejs/i.test(note)
  );
  const splitRuntimePenalty = mentionsCargoInstall && mentionsNodeRequirement ? 0.24 : 0;
  const externalDependencyPenalty = repo.remoteDependencyNotes.length === 0 ? 0 : localModeScore >= 0.7 ? 0.08 : 0.22;
  const hasSolana = repo.frameworks.some((f) => f.startsWith("solana"));
  const frameworkBonus = clamp(repo.frameworks.length / 5);
  const solanaBonus = hasSolana ? 0.12 : 0;
  return {
    hasReadme,
    docsScore,
    commandDocsScore,
    installScore,
    localModeScore,
    outcomeScore: clamp(outcomeHits / 12),
    exampleScore,
    artifactScore: clamp(Math.max(artifactScore, artifactTextHits > 0 ? 0.58 : 0)),
    proofScore,
    ciScore,
    commitScore,
    manifestScore,
    lockScore,
    changelogScore,
    cleanScore,
    licenseScore,
    envScore,
    frameworkBonus,
    solanaBonus,
    splitRuntimePenalty,
    externalDependencyPenalty
  };
}
function buildAxes(repo, scores) {
  const immediacy = clamp(
    0.32 * scores.commandDocsScore + 0.28 * scores.localModeScore + 0.22 * scores.exampleScore + 0.18 * scores.hasReadme - scores.externalDependencyPenalty
  );
  const clarity = clamp(
    0.34 * scores.hasReadme + 0.26 * scores.commandDocsScore + 0.22 * scores.outcomeScore + 0.18 * scores.docsScore
  );
  const proof = clamp(
    0.4 * scores.proofScore + 0.25 * scores.ciScore + 0.2 * scores.exampleScore + 0.15 * scores.commitScore
  );
  const distribution = clamp(
    0.34 * scores.installScore + 0.24 * scores.manifestScore + 0.2 * scores.lockScore + 0.22 * scores.changelogScore + 0.08 * scores.frameworkBonus - scores.splitRuntimePenalty
  );
  const shareability = clamp(
    0.34 * scores.artifactScore + 0.24 * scores.exampleScore + 0.2 * scores.docsScore + 0.22 * scores.commandDocsScore
  );
  const trust = clamp(
    0.35 * scores.proofScore + 0.25 * scores.ciScore + 0.15 * scores.licenseScore + 0.15 * scores.cleanScore + 0.1 * scores.envScore + 0.06 * scores.frameworkBonus
  );
  return [
    {
      id: "immediacy",
      label: axisLabel("immediacy"),
      score: immediacy,
      summary: summarizeAxis("immediacy", immediacy)
    },
    {
      id: "clarity",
      label: axisLabel("clarity"),
      score: clarity,
      summary: summarizeAxis("clarity", clarity)
    },
    {
      id: "proof",
      label: axisLabel("proof"),
      score: proof,
      summary: summarizeAxis("proof", proof)
    },
    {
      id: "distribution",
      label: axisLabel("distribution"),
      score: distribution,
      summary: summarizeAxis("distribution", distribution)
    },
    {
      id: "shareability",
      label: axisLabel("shareability"),
      score: shareability,
      summary: summarizeAxis("shareability", shareability)
    },
    {
      id: "trust",
      label: axisLabel("trust"),
      score: trust,
      summary: summarizeAxis("trust", trust)
    }
  ];
}
async function createRealityForkLaunchRun(input) {
  const resolvedRepoPath = path2.resolve(input.repoPath);
  const repoPath = await fs2.realpath(resolvedRepoPath).catch(() => resolvedRepoPath);
  const repo = await collectRepoContext(repoPath, input.focusPaths ?? []);
  const scores = deriveRepoScores(repo);
  const axes = buildAxes(repo, scores);
  const actions = buildActions(axes);
  const branches = buildBranches2(axes, actions, repo);
  const winner = branches[0];
  const readiness = average(...axes.map((axis) => axis.score));
  const verdict = {
    winnerBranchId: winner.id,
    label: winner.label,
    reason: verdictReason(winner, axes, actions),
    score: winner.score,
    readiness
  };
  return {
    kind: "launch",
    version: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    title: input.title?.trim() || `${repo.name} launch reality fork`,
    prompt: input.prompt?.trim() || "Should we ship this now?",
    repo,
    axes,
    signals: buildSignals(repo, scores, axes),
    branches,
    verdict,
    actions,
    posts: buildPosts(repo, winner, verdict, axes)
  };
}
function defaultRealityForkLaunchOutputDir(repoPath, generatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  const stamp = generatedAt.replace(/[:.]/g, "-");
  return path2.join(path2.resolve(repoPath), ".reality-fork", "runs", `launch-${stamp}`);
}
async function writeRealityForkLaunchArtifacts(run, outputDir) {
  const absoluteOutputDir = path2.resolve(outputDir);
  const decisionPath = path2.join(absoluteOutputDir, "decision.md");
  const reportPath = path2.join(absoluteOutputDir, "report.html");
  const tracePath = path2.join(absoluteOutputDir, "trace.json");
  await fs2.mkdir(absoluteOutputDir, { recursive: true });
  await fs2.writeFile(decisionPath, renderDecisionMarkdown(run), "utf8");
  await fs2.writeFile(reportPath, renderReportHtml(run), "utf8");
  await fs2.writeFile(tracePath, JSON.stringify(tracePayload(run), null, 2), "utf8");
  return {
    outputDir: absoluteOutputDir,
    decisionPath,
    reportPath,
    tracePath
  };
}
function trimBaseUrl2(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}
var RealityForkStudioClient = class {
  baseUrl;
  fetchImpl;
  constructor(config) {
    this.baseUrl = trimBaseUrl2(config.baseUrl);
    this.fetchImpl = config.fetchImpl ?? fetch;
  }
  async requestJson(path32, init) {
    const response = await this.fetchImpl(`${this.baseUrl}${path32}`, init);
    if (!response.ok) {
      throw new Error(`Reality Fork request failed (${response.status} ${path32})`);
    }
    return response.json();
  }
  listProjects() {
    return this.requestJson("/api/reality-fork");
  }
  createUploads(formData) {
    return this.requestJson("/api/reality-fork/uploads", {
      method: "POST",
      body: formData
    });
  }
  createProject(body) {
    return this.requestJson("/api/reality-fork/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
  getProject(projectId) {
    return this.requestJson(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}`
    );
  }
  addEvidence(projectId, body) {
    return this.requestJson(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}/evidence`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );
  }
  createJob(projectId, kind = "full") {
    return this.requestJson(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}/jobs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind })
      }
    );
  }
  getJob(projectId, jobId) {
    return this.requestJson(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`
    );
  }
  publish(projectId) {
    return this.requestJson(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}/publish`,
      {
        method: "POST"
      }
    );
  }
  retry(projectId) {
    return this.requestJson(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}/retry`,
      {
        method: "POST"
      }
    );
  }
  getPublication(slug) {
    return this.requestJson(
      `/api/reality-fork/publications/${encodeURIComponent(slug)}`
    );
  }
  async *streamProject(projectId) {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/reality-fork/projects/${encodeURIComponent(projectId)}/stream`
    );
    if (!response.ok || !response.body) {
      throw new Error(`Reality Fork stream failed (${response.status})`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        let eventName = "message";
        let data = "";
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event: ")) eventName = line.slice(7);
          if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (eventName === "done") return;
        if (eventName === "ping" || !data) continue;
        yield JSON.parse(data);
      }
    }
  }
};
function createRealityForkStudioClient(config) {
  return new RealityForkStudioClient(config);
}

// node_modules/.pnpm/chalk@5.6.2/node_modules/chalk/source/vendor/ansi-styles/index.js
var ANSI_BACKGROUND_OFFSET = 10;
var wrapAnsi16 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
var wrapAnsi256 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
var wrapAnsi16m = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
var styles = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29]
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39],
    // Alias of `blackBright`
    grey: [90, 39],
    // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39]
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    // Alias of `bgBlackBright`
    bgGrey: [100, 49],
    // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49]
  }
};
var modifierNames = Object.keys(styles.modifier);
var foregroundColorNames = Object.keys(styles.color);
var backgroundColorNames = Object.keys(styles.bgColor);
var colorNames = [...foregroundColorNames, ...backgroundColorNames];
function assembleStyles() {
  const codes = /* @__PURE__ */ new Map();
  for (const [groupName, group] of Object.entries(styles)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles, "codes", {
    value: codes,
    enumerable: false
  });
  styles.color.close = "\x1B[39m";
  styles.bgColor.close = "\x1B[49m";
  styles.color.ansi = wrapAnsi16();
  styles.color.ansi256 = wrapAnsi256();
  styles.color.ansi16m = wrapAnsi16m();
  styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          /* eslint-disable no-bitwise */
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
          /* eslint-enable no-bitwise */
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles;
}
var ansiStyles = assembleStyles();
var ansi_styles_default = ansiStyles;

// node_modules/.pnpm/chalk@5.6.2/node_modules/chalk/source/vendor/supports-color/index.js
import process2 from "node:process";
import os2 from "node:os";
import tty from "node:tty";
function hasFlag(flag, argv = globalThis.Deno ? globalThis.Deno.args : process2.argv) {
  const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
  const position = argv.indexOf(prefix + flag);
  const terminatorPosition = argv.indexOf("--");
  return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}
var { env } = process2;
var flagForceColor;
if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
  flagForceColor = 0;
} else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
  flagForceColor = 1;
}
function envForceColor() {
  if ("FORCE_COLOR" in env) {
    if (env.FORCE_COLOR === "true") {
      return 1;
    }
    if (env.FORCE_COLOR === "false") {
      return 0;
    }
    return env.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
  }
}
function translateLevel(level) {
  if (level === 0) {
    return false;
  }
  return {
    level,
    hasBasic: true,
    has256: level >= 2,
    has16m: level >= 3
  };
}
function _supportsColor(haveStream, { streamIsTTY, sniffFlags = true } = {}) {
  const noFlagForceColor = envForceColor();
  if (noFlagForceColor !== void 0) {
    flagForceColor = noFlagForceColor;
  }
  const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
  if (forceColor === 0) {
    return 0;
  }
  if (sniffFlags) {
    if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
      return 3;
    }
    if (hasFlag("color=256")) {
      return 2;
    }
  }
  if ("TF_BUILD" in env && "AGENT_NAME" in env) {
    return 1;
  }
  if (haveStream && !streamIsTTY && forceColor === void 0) {
    return 0;
  }
  const min = forceColor || 0;
  if (env.TERM === "dumb") {
    return min;
  }
  if (process2.platform === "win32") {
    const osRelease = os2.release().split(".");
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
      return Number(osRelease[2]) >= 14931 ? 3 : 2;
    }
    return 1;
  }
  if ("CI" in env) {
    if (["GITHUB_ACTIONS", "GITEA_ACTIONS", "CIRCLECI"].some((key) => key in env)) {
      return 3;
    }
    if (["TRAVIS", "APPVEYOR", "GITLAB_CI", "BUILDKITE", "DRONE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
      return 1;
    }
    return min;
  }
  if ("TEAMCITY_VERSION" in env) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
  }
  if (env.COLORTERM === "truecolor") {
    return 3;
  }
  if (env.TERM === "xterm-kitty") {
    return 3;
  }
  if (env.TERM === "xterm-ghostty") {
    return 3;
  }
  if (env.TERM === "wezterm") {
    return 3;
  }
  if ("TERM_PROGRAM" in env) {
    const version = Number.parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
    switch (env.TERM_PROGRAM) {
      case "iTerm.app": {
        return version >= 3 ? 3 : 2;
      }
      case "Apple_Terminal": {
        return 2;
      }
    }
  }
  if (/-256(color)?$/i.test(env.TERM)) {
    return 2;
  }
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
    return 1;
  }
  if ("COLORTERM" in env) {
    return 1;
  }
  return min;
}
function createSupportsColor(stream, options = {}) {
  const level = _supportsColor(stream, {
    streamIsTTY: stream && stream.isTTY,
    ...options
  });
  return translateLevel(level);
}
var supportsColor = {
  stdout: createSupportsColor({ isTTY: tty.isatty(1) }),
  stderr: createSupportsColor({ isTTY: tty.isatty(2) })
};
var supports_color_default = supportsColor;

// node_modules/.pnpm/chalk@5.6.2/node_modules/chalk/source/utilities.js
function stringReplaceAll(string, substring, replacer) {
  let index = string.indexOf(substring);
  if (index === -1) {
    return string;
  }
  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = "";
  do {
    returnValue += string.slice(endIndex, index) + substring + replacer;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}
function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
  let endIndex = 0;
  let returnValue = "";
  do {
    const gotCR = string[index - 1] === "\r";
    returnValue += string.slice(endIndex, gotCR ? index - 1 : index) + prefix + (gotCR ? "\r\n" : "\n") + postfix;
    endIndex = index + 1;
    index = string.indexOf("\n", endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

// node_modules/.pnpm/chalk@5.6.2/node_modules/chalk/source/index.js
var { stdout: stdoutColor, stderr: stderrColor } = supports_color_default;
var GENERATOR = /* @__PURE__ */ Symbol("GENERATOR");
var STYLER = /* @__PURE__ */ Symbol("STYLER");
var IS_EMPTY = /* @__PURE__ */ Symbol("IS_EMPTY");
var levelMapping = [
  "ansi",
  "ansi",
  "ansi256",
  "ansi16m"
];
var styles2 = /* @__PURE__ */ Object.create(null);
var applyOptions = (object, options = {}) => {
  if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
    throw new Error("The `level` option should be an integer from 0 to 3");
  }
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object.level = options.level === void 0 ? colorLevel : options.level;
};
var chalkFactory = (options) => {
  const chalk2 = (...strings) => strings.join(" ");
  applyOptions(chalk2, options);
  Object.setPrototypeOf(chalk2, createChalk.prototype);
  return chalk2;
};
function createChalk(options) {
  return chalkFactory(options);
}
Object.setPrototypeOf(createChalk.prototype, Function.prototype);
for (const [styleName, style] of Object.entries(ansi_styles_default)) {
  styles2[styleName] = {
    get() {
      const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
      Object.defineProperty(this, styleName, { value: builder });
      return builder;
    }
  };
}
styles2.visible = {
  get() {
    const builder = createBuilder(this, this[STYLER], true);
    Object.defineProperty(this, "visible", { value: builder });
    return builder;
  }
};
var getModelAnsi = (model, level, type, ...arguments_) => {
  if (model === "rgb") {
    if (level === "ansi16m") {
      return ansi_styles_default[type].ansi16m(...arguments_);
    }
    if (level === "ansi256") {
      return ansi_styles_default[type].ansi256(ansi_styles_default.rgbToAnsi256(...arguments_));
    }
    return ansi_styles_default[type].ansi(ansi_styles_default.rgbToAnsi(...arguments_));
  }
  if (model === "hex") {
    return getModelAnsi("rgb", level, type, ...ansi_styles_default.hexToRgb(...arguments_));
  }
  return ansi_styles_default[type][model](...arguments_);
};
var usedModels = ["rgb", "hex", "ansi256"];
for (const model of usedModels) {
  styles2[model] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "color", ...arguments_), ansi_styles_default.color.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
  const bgModel = "bg" + model[0].toUpperCase() + model.slice(1);
  styles2[bgModel] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "bgColor", ...arguments_), ansi_styles_default.bgColor.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
}
var proto = Object.defineProperties(() => {
}, {
  ...styles2,
  level: {
    enumerable: true,
    get() {
      return this[GENERATOR].level;
    },
    set(level) {
      this[GENERATOR].level = level;
    }
  }
});
var createStyler = (open, close, parent) => {
  let openAll;
  let closeAll;
  if (parent === void 0) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }
  return {
    open,
    close,
    openAll,
    closeAll,
    parent
  };
};
var createBuilder = (self, _styler, _isEmpty) => {
  const builder = (...arguments_) => applyStyle(builder, arguments_.length === 1 ? "" + arguments_[0] : arguments_.join(" "));
  Object.setPrototypeOf(builder, proto);
  builder[GENERATOR] = self;
  builder[STYLER] = _styler;
  builder[IS_EMPTY] = _isEmpty;
  return builder;
};
var applyStyle = (self, string) => {
  if (self.level <= 0 || !string) {
    return self[IS_EMPTY] ? "" : string;
  }
  let styler = self[STYLER];
  if (styler === void 0) {
    return string;
  }
  const { openAll, closeAll } = styler;
  if (string.includes("\x1B")) {
    while (styler !== void 0) {
      string = stringReplaceAll(string, styler.close, styler.open);
      styler = styler.parent;
    }
  }
  const lfIndex = string.indexOf("\n");
  if (lfIndex !== -1) {
    string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
  }
  return openAll + string + closeAll;
};
Object.defineProperties(createChalk.prototype, styles2);
var chalk = createChalk();
var chalkStderr = createChalk({ level: stderrColor ? stderrColor.level : 0 });
var source_default = chalk;

// node_modules/.pnpm/commander@12.1.0/node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// node_modules/.pnpm/string-argv@0.3.2/node_modules/string-argv/index.js
function parseArgsStringToArgv(value, env2, file) {
  var myRegexp = /([^\s'"]([^\s'"]*(['"])([^\3]*?)\3)+[^\s'"]*)|[^\s'"]+|(['"])([^\5]*?)\5/gi;
  var myString = value;
  var myArray = [];
  if (env2) {
    myArray.push(env2);
  }
  if (file) {
    myArray.push(file);
  }
  var match;
  do {
    match = myRegexp.exec(myString);
    if (match !== null) {
      myArray.push(firstString(match[1], match[6], match[0]));
    }
  } while (match !== null);
  return myArray;
}
function firstString() {
  var args = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    args[_i] = arguments[_i];
  }
  for (var i = 0; i < args.length; i++) {
    var arg = args[i];
    if (typeof arg === "string") {
      return arg;
    }
  }
}

// packages/kamiyo-reality-fork-cli/src/config.ts
import fs3 from "node:fs";
import os3 from "node:os";
import path3 from "node:path";
var DEFAULT_PROFILE = "default";
var DEFAULT_API_URL = "http://127.0.0.1:3000";
function configHome(dirOverride) {
  return dirOverride || process.env.XDG_CONFIG_HOME || path3.join(os3.homedir(), ".config");
}
function ensurePrivateDir(dir) {
  fs3.mkdirSync(dir, { recursive: true, mode: 448 });
  try {
    fs3.chmodSync(dir, 448);
  } catch {
  }
}
function setPrivateFileMode(filePath) {
  try {
    fs3.chmodSync(filePath, 384);
  } catch {
  }
}
function normalizeConfig(input) {
  const profiles = input?.profiles && Object.keys(input.profiles).length > 0 ? input.profiles : { [DEFAULT_PROFILE]: { apiUrl: DEFAULT_API_URL } };
  const activeProfile = input?.activeProfile && profiles[input.activeProfile] ? input.activeProfile : Object.keys(profiles)[0] || DEFAULT_PROFILE;
  return {
    activeProfile,
    profiles,
    workflows: input?.workflows ?? {},
    hooks: Array.isArray(input?.hooks) ? input.hooks : [],
    sessionLog: {
      enabled: input?.sessionLog?.enabled ?? true,
      path: input?.sessionLog?.path
    },
    aliases: input?.aliases ?? {}
  };
}
var ConfigStore = class _ConfigStore {
  dirPath;
  filePath;
  config;
  constructor(dirPath, filePath, config) {
    this.dirPath = dirPath;
    this.filePath = filePath;
    this.config = config;
  }
  static load(dirOverride) {
    const dirPath = path3.join(configHome(dirOverride), "kamiyo", "reality-fork-cli");
    ensurePrivateDir(dirPath);
    const filePath = path3.join(dirPath, "config.json");
    if (!fs3.existsSync(filePath)) {
      return new _ConfigStore(dirPath, filePath, normalizeConfig(void 0));
    }
    try {
      const parsed = JSON.parse(fs3.readFileSync(filePath, "utf8"));
      return new _ConfigStore(dirPath, filePath, normalizeConfig(parsed));
    } catch {
      const backupPath = `${filePath}.broken-${Date.now()}`;
      try {
        fs3.renameSync(filePath, backupPath);
      } catch {
      }
      return new _ConfigStore(dirPath, filePath, normalizeConfig(void 0));
    }
  }
  get snapshot() {
    return this.config;
  }
  get configPath() {
    return this.filePath;
  }
  get historyPath() {
    return path3.join(this.dirPath, "history");
  }
  get sessionLogPath() {
    const configured = this.config.sessionLog.path;
    if (configured) {
      ensurePrivateDir(path3.dirname(configured));
      return configured;
    }
    return path3.join(this.dirPath, "sessions.jsonl");
  }
  save() {
    ensurePrivateDir(this.dirPath);
    fs3.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), "utf8");
    setPrivateFileMode(this.filePath);
  }
  selectedProfileName(requested, fallback, allowCreate = false) {
    const candidate = [requested, fallback, this.config.activeProfile].find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
    if (!candidate) {
      return DEFAULT_PROFILE;
    }
    if (this.config.profiles[candidate]) {
      return candidate;
    }
    if (allowCreate) {
      return candidate;
    }
    throw new Error(`profile '${candidate}' not found`);
  }
  profile(name) {
    return this.config.profiles[name];
  }
  ensureProfile(name) {
    if (!this.config.profiles[name]) {
      this.config.profiles[name] = { apiUrl: DEFAULT_API_URL };
    }
    return this.config.profiles[name];
  }
  setActiveProfile(name) {
    if (!this.config.profiles[name]) {
      throw new Error(`profile '${name}' not found`);
    }
    this.config.activeProfile = name;
  }
};

// packages/kamiyo-reality-fork-cli/src/hooks.ts
import { spawnSync } from "node:child_process";

// packages/kamiyo-reality-fork-cli/src/output.ts
var quiet = false;
var verbose = false;
function setQuiet(value) {
  quiet = value;
}
function setVerbose(value) {
  verbose = value;
}
function banner() {
  if (quiet) return;
  console.log(source_default.bold("Reality Fork CLI"));
}
function info(message) {
  if (quiet) return;
  console.log(message);
}
function success(message) {
  if (quiet) return;
  console.log(source_default.green(message));
}
function warn(message) {
  console.error(source_default.yellow(message));
}
function error(message) {
  console.error(source_default.red(message));
}
function dim(message) {
  if (quiet) return;
  console.log(source_default.gray(message));
}
function debug(message) {
  if (!verbose || quiet) return;
  console.error(source_default.gray(message));
}
function print(data, format) {
  if (format === "json") {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      info("No results.");
      return;
    }
    console.table(data);
    return;
  }
  if (data && typeof data === "object") {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (typeof data === "string") {
    info(data);
  }
}

// packages/kamiyo-reality-fork-cli/src/hooks.ts
function runHooks(config, stage, context, result) {
  for (const hook of config.hooks) {
    if (!hook.enabled && hook.enabled !== void 0) continue;
    if (hook.stage !== stage || hook.command !== context.commandPath) continue;
    const shell = process.env.SHELL || "/bin/sh";
    const child = spawnSync(shell, ["-lc", hook.run], {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        REALITY_FORK_HOOK_STAGE: stage,
        REALITY_FORK_COMMAND_PATH: context.commandPath,
        REALITY_FORK_PROFILE: context.profile,
        REALITY_FORK_API_URL: context.apiUrl,
        REALITY_FORK_SOURCE: context.source,
        ...result ? {
          REALITY_FORK_EXIT_STATUS: String(result.exitStatus),
          REALITY_FORK_DURATION_MS: String(result.durationMs)
        } : {}
      }
    });
    if (child.status === 0) {
      continue;
    }
    const message = `${stage}-hook failed for '${context.commandPath}': ${hook.run}`;
    if (stage === "pre" && hook.required) {
      throw new Error(message);
    }
    warn(message);
  }
}

// packages/kamiyo-reality-fork-cli/src/sessions.ts
import fs4 from "node:fs";
var SessionLogger = class {
  enabled;
  filePath;
  constructor(config, filePath) {
    this.enabled = config.sessionLog.enabled;
    this.filePath = filePath;
  }
  append(entry) {
    if (!this.enabled) return;
    fs4.mkdirSync(requireParent(this.filePath), { recursive: true, mode: 448 });
    fs4.appendFileSync(this.filePath, `${JSON.stringify(entry)}
`, "utf8");
    try {
      fs4.chmodSync(this.filePath, 384);
    } catch {
    }
  }
};
function readSessionEntries(filePath) {
  const raw = fs4.readFileSync(filePath, "utf8");
  if (raw.trimStart().startsWith("[")) {
    return JSON.parse(raw);
  }
  return raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
}
function requireParent(filePath) {
  const index = filePath.lastIndexOf("/");
  if (index === -1) {
    return ".";
  }
  return filePath.slice(0, index);
}

// packages/kamiyo-reality-fork-cli/src/index.ts
function rootProgramName() {
  return "reality-fork";
}
function trimSlashes(value) {
  return value.replace(/\/+$/, "");
}
function shellQuote(value) {
  if (!value) return "''";
  if ([...value].every((ch) => /[A-Za-z0-9_.:/-]/.test(ch))) {
    return value;
  }
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
function rawInputFromArgv(argv) {
  return argv.map(shellQuote).join(" ");
}
function tokenizeLine(line, aliases = {}) {
  const parts = parseArgsStringToArgv(line);
  if (parts.length === 0) {
    return [];
  }
  const alias = aliases[parts[0]];
  if (!alias) {
    return parts;
  }
  return [...parseArgsStringToArgv(alias), ...parts.slice(1)];
}
function renderWorkflowStep(step, args, effective) {
  let rendered = step.replaceAll("{{profile}}", shellQuote(effective.profile));
  rendered = rendered.replaceAll("{{api_url}}", shellQuote(effective.apiUrl));
  rendered = rendered.replaceAll("{{args}}", args.map((arg) => shellQuote(arg)).join(" "));
  for (let index = 0; index < 32; index += 1) {
    rendered = rendered.replaceAll(`{{${index + 1}}}`, args[index] ? shellQuote(args[index]) : "");
  }
  return rendered;
}
function canCreateProfile(commandPath) {
  return (/* @__PURE__ */ new Set(["setup", "config set-url", "config set-output"])).has(commandPath);
}
function resolveEffectiveInvocation(store, options, defaults, source, commandPath) {
  const profileName = store.selectedProfileName(
    options.profile,
    defaults.profile,
    canCreateProfile(commandPath)
  );
  const profile = store.profile(profileName) ?? store.ensureProfile(profileName);
  return {
    profile: profileName,
    apiUrl: trimSlashes(options.apiUrl || defaults.apiUrl || profile.apiUrl || DEFAULT_API_URL),
    output: options.output || defaults.output || profile.output || "table",
    quiet: Boolean(options.quiet || defaults.quiet),
    verbose: Boolean(options.verbose || defaults.verbose),
    source
  };
}
function buildProjectTableRows(projects) {
  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    status: project.status,
    evidence: project.stats.evidenceCount,
    simulations: project.stats.simulationCount,
    updatedAt: new Date(project.updatedAt).toISOString()
  }));
}
function buildFixtureTableRows(items) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    winner: item.winnerLabel ?? "\u2014",
    source: item.sourceLabel
  }));
}
function printProjectSummary(project) {
  info(source_default.bold(project.title));
  dim(`${project.id} | ${project.status} | ${project.slug}`);
  info(`prompt: ${project.prompt}`);
  if (project.description) {
    info(`description: ${project.description}`);
  }
  info(
    `evidence ${project.stats.evidenceCount}, simulations ${project.stats.simulationCount}, claims ${project.stats.claimCount}`
  );
  if (project.decision?.winnerLabel) {
    info(`winner: ${project.decision.winnerLabel}`);
  }
  if (project.report?.headline) {
    info(`headline: ${project.report.headline}`);
  }
}
function latestSimulation(project) {
  return project.simulations[0] ?? null;
}
function guessMimeType(filePath) {
  const ext = path4.extname(filePath).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".html":
      return "text/html";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}
function createClient(apiUrl) {
  return createRealityForkStudioClient({ baseUrl: trimSlashes(apiUrl) });
}
async function promptText(question, initial) {
  const rl = createInterface({ input: process3.stdin, output: process3.stdout });
  try {
    const suffix = initial ? ` [${initial}]` : "";
    const answer = await rl.question(`${question}${suffix}: `);
    return answer.trim() || initial || "";
  } finally {
    rl.close();
  }
}
async function setupProfile(store, requestedProfile, requestedUrl) {
  const profileName = requestedProfile?.trim() || await promptText("Profile name", store.snapshot.activeProfile || DEFAULT_PROFILE);
  const profile = store.ensureProfile(profileName);
  const apiUrl = requestedUrl?.trim() || await promptText("API base URL", profile.apiUrl || DEFAULT_API_URL);
  const output = await promptText("Default output (table/json)", profile.output || "table");
  profile.apiUrl = trimSlashes(apiUrl || DEFAULT_API_URL);
  profile.output = output === "json" ? "json" : "table";
  store.setActiveProfile(profileName);
  store.save();
  success(`profile '${profileName}' saved`);
}
async function healthCheck(url) {
  try {
    const response = await fetch(`${trimSlashes(url)}/health`);
    if (!response.ok) {
      return { status: "warn", details: `health returned ${response.status}` };
    }
    return { status: "ok", details: "service health reachable" };
  } catch (cause) {
    return {
      status: "error",
      details: cause instanceof Error ? cause.message : "health probe failed"
    };
  }
}
async function routeCheck(url) {
  try {
    const response = await fetch(`${trimSlashes(url)}/api/reality-fork`);
    if (!response.ok) {
      return { status: "warn", details: `route returned ${response.status}` };
    }
    return { status: "ok", details: "Reality Fork API reachable" };
  } catch (cause) {
    return {
      status: "error",
      details: cause instanceof Error ? cause.message : "route probe failed"
    };
  }
}
async function fixtureCheck() {
  try {
    const items = await listFixtureScenarios();
    return {
      status: "ok",
      details: `${items.length} fixtures in ${fixtureDirectory()}`
    };
  } catch (cause) {
    return {
      status: "error",
      details: cause instanceof Error ? cause.message : "fixture scan failed"
    };
  }
}
function sessionLogCheck(store) {
  const filePath = store.sessionLogPath;
  try {
    fs5.mkdirSync(path4.dirname(filePath), { recursive: true, mode: 448 });
    if (!fs5.existsSync(filePath)) {
      fs5.writeFileSync(filePath, "", "utf8");
    }
    return { status: "ok", details: filePath };
  } catch (cause) {
    return {
      status: "error",
      details: cause instanceof Error ? cause.message : "session log unavailable"
    };
  }
}
function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}
function displayPathFromCwd(filePath) {
  const relative = path4.relative(process3.cwd(), filePath);
  if (!relative || relative.startsWith("..")) {
    return filePath;
  }
  return relative;
}
function printLaunchRunJson(run, artifacts) {
  print(
    {
      verdict: run.verdict,
      topAxes: run.axes.slice().sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, 3),
      actions: run.actions,
      posts: run.posts,
      artifacts
    },
    "json"
  );
}
function axisBar(score, width = 20) {
  const filled = Math.round(score * width);
  const empty = width - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}
function axisColor(score) {
  if (score >= 0.7) return source_default.green;
  if (score >= 0.5) return source_default.yellow;
  return source_default.red;
}
function verdictColor(branchId) {
  if (branchId === "ship_now") return source_default.green;
  if (branchId === "narrow_launch") return source_default.yellow;
  return source_default.red;
}
async function renderLaunchProgress(run, artifacts) {
  const w = process3.stderr.write.bind(process3.stderr);
  w(`
  ${source_default.dim("repo")}  ${source_default.bold(run.repo.name)}
`);
  w(`  ${source_default.dim("files")} ${run.repo.fileCount}`);
  if (run.repo.languages.length > 0) {
    w(` ${source_default.dim("\xB7")} ${run.repo.languages.slice(0, 3).map((l) => l.name).join(", ")}`);
  }
  if (run.repo.frameworks.length > 0) {
    w(` ${source_default.dim("\xB7")} ${run.repo.frameworks.join(", ")}`);
  }
  w("\n\n");
  const padLen = Math.max(...run.axes.map((a) => a.label.length));
  for (const axis of run.axes) {
    const label = axis.label.padEnd(padLen);
    const color = axisColor(axis.score);
    const bar = color(axisBar(axis.score));
    const pct = color(formatPercent(axis.score).padStart(4));
    w(`  ${source_default.dim(label)}  ${bar}  ${pct}
`);
    await sleep(60);
  }
  w("\n");
  const vColor = verdictColor(run.verdict.winnerBranchId);
  w(`  ${vColor(source_default.bold(run.verdict.label))}
`);
  w(`  ${source_default.dim(run.verdict.reason)}
`);
  w(`  ${source_default.dim("readiness")} ${vColor(formatPercent(run.verdict.readiness))}
`);
  w(`
  ${source_default.dim("artifacts")}
`);
  w(`  ${source_default.dim("decision")} ${displayPathFromCwd(artifacts.decisionPath)}
`);
  w(`  ${source_default.dim("report")}   ${displayPathFromCwd(artifacts.reportPath)}
`);
  w(`  ${source_default.dim("trace")}    ${displayPathFromCwd(artifacts.tracePath)}

`);
}
function openInBrowser(filePath) {
  const platform = process3.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  try {
    execFileSync2(cmd, [filePath], { stdio: "ignore" });
  } catch {
  }
}
async function waitForJob(projectId, jobId, effective) {
  const client = createClient(effective.apiUrl);
  let lastStage = "";
  for (; ; ) {
    const job = await client.getJob(projectId, jobId);
    if (job.currentStage !== lastStage && effective.output === "table") {
      dim(`${job.id} ${job.status}/${job.currentStage} (${job.progress}%)`);
      lastStage = job.currentStage;
    }
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    await sleep(1500);
  }
}
function workflowSampleArgs(workflow) {
  const maxIndex = workflow.steps.reduce((max, step) => {
    for (let index = 1; index <= 32; index += 1) {
      if (step.includes(`{{${index}}}`)) {
        max = Math.max(max, index);
      }
    }
    return max;
  }, 0);
  return Array.from({ length: maxIndex }, (_, index) => `arg${index + 1}`);
}
async function runCli(argv, state) {
  const program2 = buildProgram(state);
  program2.exitOverride();
  program2.showHelpAfterError(false);
  try {
    await program2.parseAsync(argv, { from: "user" });
  } catch (cause) {
    if (cause instanceof CommanderError) {
      if (cause.code === "commander.helpDisplayed" || cause.code === "commander.version") {
        return;
      }
      throw new Error(cause.message);
    }
    throw cause;
  }
}
function wrapAction(state, commandPath, handler) {
  return async (...params) => {
    const command = params.at(-1);
    const args = params.slice(0, -1);
    if (state.source !== "cli" && commandPath === "shell") {
      throw new Error("already in shell mode");
    }
    if (state.source === "workflow" && commandPath === "workflow run") {
      throw new Error("workflow nesting is not supported");
    }
    if (state.source === "session-replay" && commandPath === "session replay") {
      throw new Error("session replay cannot replay another session");
    }
    const effective = resolveEffectiveInvocation(
      state.store,
      command.optsWithGlobals(),
      state.defaults,
      state.source,
      commandPath
    );
    setQuiet(effective.quiet);
    setVerbose(effective.verbose);
    const context = {
      store: state.store,
      effective,
      commandPath,
      rawInput: state.rawInput,
      runNested: (argv, options) => runCli(argv, {
        store: state.store,
        source: options.source ?? state.source,
        defaults: options.defaults ?? {
          profile: effective.profile,
          apiUrl: effective.apiUrl,
          output: effective.output,
          quiet: effective.quiet,
          verbose: effective.verbose
        },
        rawInput: options.rawInput,
        logSession: options.logSession
      })
    };
    const hookContext = {
      commandPath,
      profile: effective.profile,
      apiUrl: effective.apiUrl,
      source: effective.source
    };
    runHooks(state.store.snapshot, "pre", hookContext);
    const startedAt = Date.now();
    let exitStatus = 0;
    try {
      await handler(context, args, command);
    } catch (cause) {
      exitStatus = 1;
      throw cause;
    } finally {
      runHooks(state.store.snapshot, "post", hookContext, {
        exitStatus,
        durationMs: Date.now() - startedAt
      });
      if (state.logSession !== false && state.rawInput && !commandPath.startsWith("session ")) {
        new SessionLogger(state.store.snapshot, state.store.sessionLogPath).append({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          profile: effective.profile,
          command: state.rawInput,
          exitStatus,
          durationMs: Date.now() - startedAt
        });
      }
    }
  };
}
function buildProgram(state) {
  const program2 = new Command();
  const jsonOption = new Option("--output <format>", "Output format").choices(["table", "json"]);
  program2.name(rootProgramName()).description("Repo-aware CLI for launch stress tests, fixtures, and remote project operations").option("--api-url <url>", "Reality Fork API base URL").option("--profile <name>", "Profile name").addOption(jsonOption).option("--quiet", "Suppress non-essential output").option("--verbose", "Show debug output");
  program2.command("setup").description("Configure a local profile").action(
    wrapAction(state, "setup", async ({ store, effective }) => {
      await setupProfile(store, effective.profile, effective.apiUrl);
    })
  );
  program2.command("doctor").description("Check profile, API reachability, fixtures, and session log health").action(
    wrapAction(state, "doctor", async ({ store, effective }) => {
      const checks = await Promise.all([
        Promise.resolve({
          name: "profile",
          status: "ok",
          details: `profile '${effective.profile}' selected`
        }),
        healthCheck(effective.apiUrl).then((result) => ({ name: "health", ...result })),
        routeCheck(effective.apiUrl).then((result) => ({ name: "route", ...result })),
        fixtureCheck().then((result) => ({ name: "fixtures", ...result })),
        Promise.resolve({ name: "session_log", ...sessionLogCheck(store) })
      ]);
      print(checks, effective.output);
    })
  );
  const profile = program2.command("profile").description("Manage named profiles");
  profile.command("list").description("List profiles").action(
    wrapAction(state, "profile list", async ({ store, effective }) => {
      const rows = Object.entries(store.snapshot.profiles).map(([name, item]) => ({
        name,
        active: name === store.snapshot.activeProfile ? "yes" : "",
        apiUrl: item.apiUrl,
        output: item.output ?? "table"
      }));
      print(rows, effective.output);
    })
  );
  profile.command("show").argument("[name]", "Profile name").description("Show one profile").action(
    wrapAction(state, "profile show", async ({ store, effective }, [name]) => {
      const selected = store.selectedProfileName(
        typeof name === "string" ? name : void 0,
        effective.profile
      );
      const item = store.profile(selected);
      if (!item) {
        throw new Error(`profile '${selected}' not found`);
      }
      print(
        {
          name: selected,
          active: selected === store.snapshot.activeProfile,
          apiUrl: item.apiUrl,
          output: item.output ?? "table"
        },
        effective.output
      );
    })
  );
  profile.command("use").argument("<name>", "Profile name").description("Set the active profile").action(
    wrapAction(state, "profile use", async ({ store }, [name]) => {
      if (typeof name !== "string") {
        throw new Error("profile name is required");
      }
      store.setActiveProfile(name);
      store.save();
      success(`active profile set to '${name}'`);
    })
  );
  const config = program2.command("config").description("Inspect and update CLI config");
  config.command("show").description("Print the current config").action(
    wrapAction(state, "config show", async ({ store, effective }) => {
      print(store.snapshot, effective.output);
    })
  );
  config.command("path").description("Show the config path").action(
    wrapAction(state, "config path", async ({ store, effective }) => {
      print({ configPath: store.configPath }, effective.output);
    })
  );
  config.command("set-url").argument("<url>", "API base URL").description("Set the API URL on a profile").action(
    wrapAction(state, "config set-url", async ({ store, effective }, [url]) => {
      if (typeof url !== "string" || !url.trim()) {
        throw new Error("url is required");
      }
      const profile2 = store.ensureProfile(effective.profile);
      profile2.apiUrl = trimSlashes(url);
      store.save();
      success(`profile '${effective.profile}' API URL updated`);
    })
  );
  config.command("set-output").argument("<format>", "table or json").description("Set the default output mode on a profile").action(
    wrapAction(state, "config set-output", async ({ store, effective }, [value]) => {
      if (value !== "table" && value !== "json") {
        throw new Error("format must be 'table' or 'json'");
      }
      const profile2 = store.ensureProfile(effective.profile);
      profile2.output = value;
      store.save();
      success(`profile '${effective.profile}' output updated`);
    })
  );
  const run = program2.command("run").description("Run local repo-aware Reality Fork workflows");
  run.command("launch").option("--repo <path>", "Repository path", ".").option("--focus <path...>", "Limit analysis to specific subpaths inside the repo").option("--prompt <text>", "Launch question", "Should we ship this now?").option("--title <text>", "Report title").option("--output-dir <path>", "Directory for decision.md, report.html, and trace.json").option("--open", "Open report.html in default browser after run").description("Stress-test a repo launch and emit shareable artifacts").action(
    wrapAction(state, "run launch", async ({ effective }, [options]) => {
      const launchOptions = options ?? {};
      const repoPath = path4.resolve(launchOptions.repo || ".");
      const runResult = await createRealityForkLaunchRun({
        repoPath,
        focusPaths: Array.isArray(launchOptions.focus) ? launchOptions.focus : void 0,
        prompt: launchOptions.prompt,
        title: launchOptions.title
      });
      const outputDir = launchOptions.outputDir ? path4.resolve(launchOptions.outputDir) : defaultRealityForkLaunchOutputDir(repoPath, runResult.generatedAt);
      const artifacts = await writeRealityForkLaunchArtifacts(runResult, outputDir);
      if (effective.output === "json") {
        printLaunchRunJson(runResult, artifacts);
      } else if (!effective.quiet) {
        await renderLaunchProgress(runResult, artifacts);
      }
      if (launchOptions.open) {
        openInBrowser(artifacts.reportPath);
      }
    })
  );
  run.command("diff").argument("<before>", "Path to first trace.json or output directory").argument("<after>", "Path to second trace.json or output directory").option("--output-dir <path>", "Write diff.md and diff.html to this directory").description("Compare two launch runs and show score deltas").action(
    wrapAction(state, "run diff", async ({ effective }, [beforeArg, afterArg, options]) => {
      const diffOptions = options ?? {};
      function resolveTrace(arg) {
        const p = path4.resolve(String(arg));
        if (p.endsWith(".json")) return p;
        return path4.join(p, "trace.json");
      }
      const beforePath = resolveTrace(beforeArg);
      const afterPath = resolveTrace(afterArg);
      const beforeRun = JSON.parse(fs5.readFileSync(beforePath, "utf8"));
      const afterRun = JSON.parse(fs5.readFileSync(afterPath, "utf8"));
      const diff = diffLaunchRuns(beforeRun, afterRun);
      if (effective.output === "json") {
        print(diff, "json");
      } else if (!effective.quiet) {
        const w = process3.stderr.write.bind(process3.stderr);
        w(`
  ${source_default.bold("Launch Diff")}
`);
        w(`  ${source_default.dim(diff.before.generatedAt)} \u2192 ${source_default.dim(diff.after.generatedAt)}

`);
        const rColor = diff.readinessDelta > 5e-3 ? source_default.green : diff.readinessDelta < -5e-3 ? source_default.red : source_default.dim;
        const rSign = diff.readinessDelta > 0 ? "+" : "";
        w(`  ${source_default.dim("readiness")} ${formatPercent(diff.before.readiness)} \u2192 ${formatPercent(diff.after.readiness)} ${rColor(`${rSign}${Math.round(diff.readinessDelta * 100)}%`)}
`);
        if (diff.verdictChanged) {
          w(`  ${source_default.dim("verdict")}   ${diff.before.verdictLabel} \u2192 ${source_default.bold(diff.after.verdictLabel)}
`);
        }
        w("\n");
        const padLen = Math.max(...diff.axes.map((a) => a.label.length));
        for (const axis of diff.axes) {
          const label = axis.label.padEnd(padLen);
          const dSign = axis.delta > 0 ? "+" : "";
          const dText = `${dSign}${Math.round(axis.delta * 100)}%`;
          const indicator = axis.direction === "up" ? source_default.green(`\u25B2 ${dText}`) : axis.direction === "down" ? source_default.red(`\u25BC ${dText}`) : source_default.dim(`\u2500 ${dText}`);
          w(`  ${source_default.dim(label)}  ${formatPercent(axis.before).padStart(4)} \u2192 ${formatPercent(axis.after).padStart(4)}  ${indicator}
`);
        }
        w("\n");
      }
      if (diffOptions.outputDir) {
        const outDir = path4.resolve(diffOptions.outputDir);
        const { promises: fsp } = await import("node:fs");
        await fsp.mkdir(outDir, { recursive: true });
        await fsp.writeFile(path4.join(outDir, "diff.md"), renderDiffMarkdown(diff), "utf8");
        await fsp.writeFile(path4.join(outDir, "diff.html"), renderDiffHtml(diff), "utf8");
        if (!effective.quiet && effective.output !== "json") {
          info(`diff artifacts written to ${displayPathFromCwd(outDir)}`);
        }
      }
    })
  );
  run.command("watch").option("--repo <path>", "Repository path", ".").option("--focus <path...>", "Limit analysis to specific subpaths inside the repo").option("--prompt <text>", "Launch question", "Should we ship this now?").option("--title <text>", "Report title").option("--output-dir <path>", "Directory for artifacts").option("--open", "Open report.html after each run").description("Watch a repo and re-run launch analysis on file changes").action(
    wrapAction(state, "run watch", async ({ effective }, [options]) => {
      const watchOptions = options ?? {};
      const repoPath = path4.resolve(watchOptions.repo || ".");
      const { watch } = await import("node:fs");
      let running = false;
      let queued = false;
      let debounceTimer = null;
      async function runOnce() {
        if (running) {
          queued = true;
          return;
        }
        running = true;
        process3.stderr.write("\x1B[2J\x1B[H");
        try {
          const runResult = await createRealityForkLaunchRun({
            repoPath,
            focusPaths: Array.isArray(watchOptions.focus) ? watchOptions.focus : void 0,
            prompt: watchOptions.prompt,
            title: watchOptions.title
          });
          const outputDir = watchOptions.outputDir ? path4.resolve(watchOptions.outputDir) : defaultRealityForkLaunchOutputDir(repoPath, runResult.generatedAt);
          const artifacts = await writeRealityForkLaunchArtifacts(runResult, outputDir);
          if (effective.output === "json") {
            printLaunchRunJson(runResult, artifacts);
          } else {
            await renderLaunchProgress(runResult, artifacts);
          }
          if (watchOptions.open) openInBrowser(artifacts.reportPath);
        } catch (err) {
          error(err instanceof Error ? err.message : "run failed");
        }
        running = false;
        process3.stderr.write(source_default.dim("  watching for changes...\n"));
        if (queued) {
          queued = false;
          runOnce();
        }
      }
      const ignoreDirs = /* @__PURE__ */ new Set([".git", ".reality-fork", "node_modules", "dist", "target"]);
      watch(repoPath, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const first = filename.split(path4.sep)[0];
        if (ignoreDirs.has(first)) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runOnce, 500);
      });
      await runOnce();
      await new Promise((resolve) => {
        process3.on("SIGINT", () => {
          resolve();
        });
      });
    })
  );
  run.command("share").option("--output-dir <path>", "Directory containing run artifacts").option("--repo <path>", "Repository path (used to find latest run)", ".").description("Share the latest launch run as a GitHub gist").action(
    wrapAction(state, "run share", async ({ effective }, [options]) => {
      const shareOptions = options ?? {};
      const { promises: fsp } = await import("node:fs");
      let outputDir;
      if (shareOptions.outputDir) {
        outputDir = path4.resolve(shareOptions.outputDir);
      } else {
        const repoPath = path4.resolve(shareOptions.repo || ".");
        const runsDir = path4.join(repoPath, ".reality-fork", "runs");
        let entries;
        try {
          entries = (await fsp.readdir(runsDir)).filter((e) => e.startsWith("launch-")).sort().reverse();
        } catch {
          throw new Error(`no runs found in ${runsDir}`);
        }
        if (entries.length === 0) throw new Error(`no launch runs found in ${runsDir}`);
        outputDir = path4.join(runsDir, entries[0]);
      }
      const decisionPath = path4.join(outputDir, "decision.md");
      const tracePath = path4.join(outputDir, "trace.json");
      for (const f of [decisionPath, tracePath]) {
        try {
          await fsp.access(f);
        } catch {
          throw new Error(`missing artifact: ${f}`);
        }
      }
      try {
        const result = execFileSync2("gh", [
          "gist",
          "create",
          "--public",
          "--desc",
          "Reality Fork launch run",
          decisionPath,
          tracePath
        ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
        if (effective.output === "json") {
          print({ gistUrl: result, outputDir }, "json");
        } else {
          success(`gist created: ${result}`);
        }
      } catch {
        const decision = await fsp.readFile(decisionPath, "utf8");
        try {
          const pbcopy = process3.platform === "darwin" ? "pbcopy" : process3.platform === "win32" ? "clip" : "xclip";
          const { execSync } = await import("node:child_process");
          execSync(pbcopy, { input: decision, stdio: ["pipe", "ignore", "ignore"] });
          success("decision.md copied to clipboard (install gh cli to create gists)");
        } catch {
          error("gh cli not found and clipboard copy failed. install gh: https://cli.github.com");
        }
      }
    })
  );
  const fixtures = program2.command("fixtures").description("Browse bundled Reality Fork fixtures");
  fixtures.command("list").description("List fixture scenarios").action(
    wrapAction(state, "fixtures list", async ({ effective }) => {
      const items = await listFixtureScenarios();
      print(effective.output === "json" ? items : buildFixtureTableRows(items), effective.output);
    })
  );
  fixtures.command("show").argument("<id>", "Fixture id or slug").description("Show one fixture scenario").action(
    wrapAction(state, "fixtures show", async ({ effective }, [id]) => {
      if (typeof id !== "string") {
        throw new Error("fixture id is required");
      }
      const scenario = await loadFixtureScenario(id);
      if (effective.output === "json") {
        print(scenario, effective.output);
        return;
      }
      info(source_default.bold(scenario.title));
      dim(`${scenario.id} | ${scenario.status} | ${scenario.sourceLabel}`);
      info(scenario.summary);
      info(`winner: ${scenario.decision.winnerLabel ?? "\u2014"}`);
      info(
        `branches: ${scenario.branches.length} | replay events: ${scenario.replay.events.length}`
      );
    })
  );
  fixtures.command("replay").argument("<id>", "Fixture id or slug").description("Print the replay timeline for a fixture").action(
    wrapAction(state, "fixtures replay", async ({ effective }, [id]) => {
      if (typeof id !== "string") {
        throw new Error("fixture id is required");
      }
      const scenario = await loadFixtureScenario(id);
      print(
        effective.output === "json" ? scenario.replay.events : scenario.replay.events.map((event) => ({
          phase: event.phase,
          title: event.title,
          branch: event.branchLabel ?? "\u2014",
          tone: event.tone
        })),
        effective.output
      );
    })
  );
  const uploads = program2.command("uploads").description("Upload local files to a remote Reality Fork API");
  uploads.command("add").argument("<paths...>", "File paths").description("Upload files and return upload ids").action(
    wrapAction(state, "uploads add", async ({ effective }, [pathsArg]) => {
      const paths = Array.isArray(pathsArg) ? pathsArg : [];
      if (paths.length === 0) {
        throw new Error("at least one file path is required");
      }
      const formData = new FormData();
      for (const filePath of paths) {
        const absolutePath = path4.resolve(String(filePath));
        const bytes = fs5.readFileSync(absolutePath);
        formData.append(
          "files",
          new Blob([bytes], { type: guessMimeType(absolutePath) }),
          path4.basename(absolutePath)
        );
      }
      const result = await createClient(effective.apiUrl).createUploads(formData);
      print(result.uploads, effective.output);
    })
  );
  const projects = program2.command("projects").description("Operate on remote Reality Fork projects");
  projects.command("list").description("List projects from the configured API").action(
    wrapAction(state, "projects list", async ({ effective }) => {
      const result = await createClient(effective.apiUrl).listProjects();
      print(
        effective.output === "json" ? result.projects : buildProjectTableRows(result.projects),
        effective.output
      );
    })
  );
  projects.command("get").argument("<projectId>", "Project id").description("Fetch project detail").action(
    wrapAction(state, "projects get", async ({ effective }, [projectId]) => {
      if (typeof projectId !== "string") {
        throw new Error("project id is required");
      }
      const project = await createClient(effective.apiUrl).getProject(projectId);
      if (effective.output === "json") {
        print(project, effective.output);
        return;
      }
      printProjectSummary(project);
      const top = latestSimulation(project);
      if (top) {
        info(`top simulation: ${top.title} (${top.probability}% / impact ${top.impactScore})`);
      }
    })
  );
  projects.command("create").description("Create a new project on a remote Reality Fork API").requiredOption("--prompt <prompt>", "Prompt or claim to evaluate").option("--title <title>", "Project title").option("--description <text>", "Project description").option(
    "--tag <tag>",
    "Attach a tag",
    (value, acc) => {
      acc.push(value);
      return acc;
    },
    []
  ).option(
    "--url <url>",
    "Attach a URL source",
    (value, acc) => {
      acc.push(value);
      return acc;
    },
    []
  ).option(
    "--file <path>",
    "Upload a local file",
    (value, acc) => {
      acc.push(value);
      return acc;
    },
    []
  ).option("--text <text>", "Attach pasted text").option("--decision-mode <mode>", "score_only, score_then_truth_court, truth_court_required").option("--wait", "Poll the initial job until it finishes").action(
    wrapAction(state, "projects create", async ({ effective }, [options]) => {
      const commandOptions = options;
      const client = createClient(effective.apiUrl);
      let uploadIds;
      if (commandOptions.file.length > 0) {
        const formData = new FormData();
        for (const filePath of commandOptions.file) {
          const absolutePath = path4.resolve(filePath);
          formData.append(
            "files",
            new Blob([fs5.readFileSync(absolutePath)], { type: guessMimeType(absolutePath) }),
            path4.basename(absolutePath)
          );
        }
        const uploadResponse = await client.createUploads(formData);
        uploadIds = uploadResponse.uploads.map(
          (item) => item.id
        );
      }
      const body = {
        title: commandOptions.title,
        prompt: commandOptions.prompt,
        description: commandOptions.description,
        tags: commandOptions.tag.length > 0 ? commandOptions.tag : void 0,
        uploadIds,
        pastedText: commandOptions.text,
        urls: commandOptions.url.length > 0 ? commandOptions.url : void 0,
        decisionMode: commandOptions.decisionMode
      };
      const created = await client.createProject(body);
      if (commandOptions.wait) {
        const finalJob = await waitForJob(created.id, created.initialJob.id, effective);
        print(
          effective.output === "json" ? { project: created, job: finalJob } : {
            projectId: created.id,
            status: finalJob.status,
            stage: finalJob.currentStage,
            progress: finalJob.progress
          },
          effective.output
        );
        return;
      }
      print(
        effective.output === "json" ? created : {
          id: created.id,
          title: created.title,
          status: created.status,
          initialJobId: created.initialJob.id,
          initialJobStage: created.initialJob.currentStage
        },
        effective.output
      );
    })
  );
  projects.command("publish").argument("<projectId>", "Project id").option("--wait", "Poll the publish job until it finishes").description("Queue a publish job").action(
    wrapAction(state, "projects publish", async ({ effective }, [projectId, options]) => {
      if (typeof projectId !== "string") {
        throw new Error("project id is required");
      }
      const job = await createClient(effective.apiUrl).publish(projectId);
      if (options.wait) {
        const finalJob = await waitForJob(projectId, job.id, effective);
        print(finalJob, effective.output);
        return;
      }
      print(job, effective.output);
    })
  );
  projects.command("retry").argument("<projectId>", "Project id").option("--wait", "Poll the retry job until it finishes").description("Queue a full rerun").action(
    wrapAction(state, "projects retry", async ({ effective }, [projectId, options]) => {
      if (typeof projectId !== "string") {
        throw new Error("project id is required");
      }
      const job = await createClient(effective.apiUrl).retry(projectId);
      if (options.wait) {
        const finalJob = await waitForJob(projectId, job.id, effective);
        print(finalJob, effective.output);
        return;
      }
      print(job, effective.output);
    })
  );
  projects.command("watch").argument("<projectId>", "Project id").description("Stream project events until the server closes the stream").action(
    wrapAction(state, "projects watch", async ({ effective }, [projectId]) => {
      if (typeof projectId !== "string") {
        throw new Error("project id is required");
      }
      const events = [];
      for await (const event of createClient(effective.apiUrl).streamProject(projectId)) {
        events.push(event);
        if (effective.output === "json") {
          process3.stdout.write(`${JSON.stringify(event)}
`);
        } else {
          info(`${new Date(event.createdAt).toISOString()} ${event.eventType}`);
        }
      }
      if (effective.output === "table") {
        dim(`stream closed after ${events.length} events`);
      }
    })
  );
  const workflow = program2.command("workflow").description("Run local declarative workflows");
  workflow.command("list").description("List configured workflows").action(
    wrapAction(state, "workflow list", async ({ store, effective }) => {
      const rows = Object.entries(store.snapshot.workflows).map(([name, item]) => ({
        name,
        steps: item.steps.length,
        description: item.description ?? "\u2014"
      }));
      print(rows, effective.output);
    })
  );
  workflow.command("validate").argument("[name]", "Workflow name").description("Validate one workflow or all workflows").action(
    wrapAction(state, "workflow validate", async ({ store, effective }, [name]) => {
      const entries = typeof name === "string" ? [[name, store.snapshot.workflows[name]]] : Object.entries(store.snapshot.workflows);
      if (entries.length === 0) {
        throw new Error("no workflows configured");
      }
      const results = entries.map(([workflowName, workflowDef]) => {
        if (!workflowDef) {
          throw new Error(`workflow '${workflowName}' not found`);
        }
        const rendered = workflowDef.steps.map(
          (step) => renderWorkflowStep(step, workflowSampleArgs(workflowDef), effective)
        );
        for (const step of rendered) {
          const tokens = tokenizeLine(step, store.snapshot.aliases);
          if (tokens[0] === "workflow" && tokens[1] === "run") {
            throw new Error(`workflow '${workflowName}' contains nested workflow execution`);
          }
        }
        return { name: workflowName, status: "valid", steps: rendered };
      });
      print(results, effective.output);
    })
  );
  workflow.command("run").argument("<name>", "Workflow name").argument("[args...]", "Workflow args").option("--dry-run", "Render steps without executing them").description("Render and execute a workflow").action(
    wrapAction(
      state,
      "workflow run",
      async ({ store, effective, runNested }, [name, workflowArgs, options]) => {
        if (typeof name !== "string") {
          throw new Error("workflow name is required");
        }
        const workflowDef = store.snapshot.workflows[name];
        if (!workflowDef) {
          throw new Error(`workflow '${name}' not found`);
        }
        const args = Array.isArray(workflowArgs) ? workflowArgs.map(String) : [];
        const rendered = workflowDef.steps.map((step) => renderWorkflowStep(step, args, effective));
        if (options.dryRun) {
          print(
            rendered.map((step, index) => ({ step: index + 1, command: step })),
            effective.output
          );
          return;
        }
        for (const step of rendered) {
          dim(`workflow ${name}: ${step}`);
          await runNested(tokenizeLine(step, store.snapshot.aliases), {
            source: "workflow",
            rawInput: step
          });
        }
      }
    )
  );
  const session = program2.command("session").description("Export and replay shell sessions");
  session.command("export").argument("[file]", "Session log path").option("--limit <count>", "Limit number of entries", (value) => parseInt(value, 10)).description("Print the session log").action(
    wrapAction(state, "session export", async ({ store, effective }, [filePath, options]) => {
      const entries = readSessionEntries(
        typeof filePath === "string" && filePath.trim() ? filePath : store.sessionLogPath
      );
      const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit || 0) : void 0;
      const selected = limit ? entries.slice(-limit) : entries;
      print(selected, effective.output);
    })
  );
  session.command("replay").argument("[file]", "Session log path").option("--execute", "Re-run commands instead of printing them").option("--limit <count>", "Limit number of entries", (value) => parseInt(value, 10)).description("Replay a recorded session").action(
    wrapAction(
      state,
      "session replay",
      async ({ store, effective, runNested }, [filePath, options]) => {
        const entries = readSessionEntries(
          typeof filePath === "string" && filePath.trim() ? filePath : store.sessionLogPath
        );
        const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit || 0) : void 0;
        const selected = limit ? entries.slice(-limit) : entries;
        if (!options.execute) {
          print(
            selected.map((entry) => ({
              timestamp: entry.timestamp,
              profile: entry.profile,
              command: entry.command
            })),
            effective.output
          );
          return;
        }
        for (const entry of selected) {
          dim(`replay: ${entry.command}`);
          await runNested(tokenizeLine(entry.command, store.snapshot.aliases), {
            source: "session-replay",
            rawInput: entry.command,
            defaults: {
              profile: entry.profile,
              apiUrl: effective.apiUrl,
              output: effective.output,
              quiet: effective.quiet,
              verbose: effective.verbose
            }
          });
        }
      }
    )
  );
  program2.command("shell").description("Start the interactive shell").action(
    wrapAction(state, "shell", async ({ store, effective, runNested }) => {
      banner();
      dim("interactive shell");
      dim("type 'help' for command help, 'exit' to quit");
      const rl = createInterface({
        input: process3.stdin,
        output: process3.stdout,
        terminal: true,
        historySize: 200,
        removeHistoryDuplicates: true
      });
      const historyPath = store.historyPath;
      const existingHistory = fs5.existsSync(historyPath) ? fs5.readFileSync(historyPath, "utf8").split("\n").filter(Boolean) : [];
      const internal = rl;
      internal.history = [...existingHistory].reverse();
      const appendedHistory = [];
      try {
        for (; ; ) {
          const line = (await rl.question(`${rootProgramName()}(${effective.profile})> `)).trim();
          if (!line) continue;
          if (line === "exit" || line === "quit") break;
          appendedHistory.push(line);
          if (line === "help" || line === "?") {
            program2.outputHelp();
            continue;
          }
          if (line.startsWith("help ") || line.startsWith("? ")) {
            const query = line.replace(/^(help|\?)\s+/, "");
            await runNested([...tokenizeLine(query, store.snapshot.aliases), "--help"], {
              source: "shell",
              rawInput: void 0,
              logSession: false
            });
            continue;
          }
          try {
            await runNested(tokenizeLine(line, store.snapshot.aliases), {
              source: "shell",
              rawInput: line
            });
          } catch (cause) {
            error(cause instanceof Error ? cause.message : String(cause));
          }
        }
      } finally {
        rl.close();
        const nextHistory = [...existingHistory, ...appendedHistory].slice(-500);
        fs5.mkdirSync(path4.dirname(historyPath), { recursive: true, mode: 448 });
        fs5.writeFileSync(
          historyPath,
          nextHistory.join("\n") + (nextHistory.length > 0 ? "\n" : ""),
          "utf8"
        );
      }
    })
  );
  return program2;
}
async function main(argv = process3.argv.slice(2)) {
  const store = ConfigStore.load();
  await runCli(argv, {
    store,
    source: "cli",
    defaults: {},
    rawInput: rawInputFromArgv(argv)
  });
}
if (process3.argv[1] && fileURLToPath2(import.meta.url) === process3.argv[1]) {
  main().catch((cause) => {
    debug(cause instanceof Error ? cause.stack || cause.message : String(cause));
    error(cause instanceof Error ? cause.message : String(cause));
    process3.exitCode = 1;
  });
}
export {
  main,
  renderWorkflowStep,
  resolveEffectiveInvocation,
  tokenizeLine
};
