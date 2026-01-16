"use strict";
/*
 * Type definitions for KAMIYO Agent Collaboration SDK
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalType = exports.MITAMA_PROGRAM_ID = void 0;
const web3_js_1 = require("@solana/web3.js");
// Program ID - must match the deployed program and IDL
exports.MITAMA_PROGRAM_ID = new web3_js_1.PublicKey('DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km');
// Signal types enum
var SignalType;
(function (SignalType) {
    SignalType[SignalType["BUY"] = 0] = "BUY";
    SignalType[SignalType["SELL"] = 1] = "SELL";
    SignalType[SignalType["HOLD"] = 2] = "HOLD";
    SignalType[SignalType["ALERT"] = 3] = "ALERT";
})(SignalType || (exports.SignalType = SignalType = {}));
//# sourceMappingURL=types.js.map