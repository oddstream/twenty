var Module;
if (!Module) Module = (typeof Module !== "undefined" ? Module : null) || {};
var moduleOverrides = {};
for (var key in Module) {
    if (Module.hasOwnProperty(key)) {
        moduleOverrides[key] = Module[key];
    }
}
var ENVIRONMENT_IS_NODE = typeof process === "object" && typeof require === "function";
var ENVIRONMENT_IS_WEB = typeof window === "object";
var ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
if (ENVIRONMENT_IS_NODE) {
    if (!Module["print"])
        Module["print"] = function print(x) {
            process["stdout"].write(x + "\n");
        };
    if (!Module["printErr"])
        Module["printErr"] = function printErr(x) {
            process["stderr"].write(x + "\n");
        };
    var nodeFS = require("fs");
    var nodePath = require("path");
    Module["read"] = function read(filename, binary) {
        filename = nodePath["normalize"](filename);
        var ret = nodeFS["readFileSync"](filename);
        if (!ret && filename != nodePath["resolve"](filename)) {
            filename = path.join(__dirname, "..", "src", filename);
            ret = nodeFS["readFileSync"](filename);
        }
        if (ret && !binary) ret = ret.toString();
        return ret;
    };
    Module["readBinary"] = function readBinary(filename) {
        return Module["read"](filename, true);
    };
    Module["load"] = function load(f) {
        globalEval(read(f));
    };
    if (process["argv"].length > 1) {
        Module["thisProgram"] = process["argv"][1].replace(/\\/g, "/");
    } else {
        Module["thisProgram"] = "unknown-program";
    }
    Module["arguments"] = process["argv"].slice(2);
    if (typeof module !== "undefined") {
        module["exports"] = Module;
    }
    process["on"]("uncaughtException", function (ex) {
        if (!(ex instanceof ExitStatus)) {
            throw ex;
        }
    });
} else if (ENVIRONMENT_IS_SHELL) {
    if (!Module["print"]) Module["print"] = print;
    if (typeof printErr != "undefined") Module["printErr"] = printErr;
    if (typeof read != "undefined") {
        Module["read"] = read;
    } else {
        Module["read"] = function read() {
            throw "no read() available (jsc?)";
        };
    }
    Module["readBinary"] = function readBinary(f) {
        if (typeof readbuffer === "function") {
            return new Uint8Array(readbuffer(f));
        }
        var data = read(f, "binary");
        assert(typeof data === "object");
        return data;
    };
    if (typeof scriptArgs != "undefined") {
        Module["arguments"] = scriptArgs;
    } else if (typeof arguments != "undefined") {
        Module["arguments"] = arguments;
    }
    this["Module"] = Module;
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    Module["read"] = function read(url) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.send(null);
        return xhr.responseText;
    };
    if (typeof arguments != "undefined") {
        Module["arguments"] = arguments;
    }
    if (typeof console !== "undefined") {
        if (!Module["print"])
            Module["print"] = function print(x) {
                console.log(x);
            };
        if (!Module["printErr"])
            Module["printErr"] = function printErr(x) {
                console.log(x);
            };
    } else {
        var TRY_USE_DUMP = false;
        if (!Module["print"])
            Module["print"] =
                TRY_USE_DUMP && typeof dump !== "undefined"
                    ? function (x) {
                          dump(x);
                      }
                    : function (x) {};
    }
    if (ENVIRONMENT_IS_WEB) {
        window["Module"] = Module;
    } else {
        Module["load"] = importScripts;
    }
} else {
    throw "Unknown runtime environment. Where are we?";
}
function globalEval(x) {
    eval.call(null, x);
}
if (!Module["load"] && Module["read"]) {
    Module["load"] = function load(f) {
        globalEval(Module["read"](f));
    };
}
if (!Module["print"]) {
    Module["print"] = function () {};
}
if (!Module["printErr"]) {
    Module["printErr"] = Module["print"];
}
if (!Module["arguments"]) {
    Module["arguments"] = [];
}
if (!Module["thisProgram"]) {
    Module["thisProgram"] = "./this.program";
}
Module.print = Module["print"];
Module.printErr = Module["printErr"];
Module["preRun"] = [];
Module["postRun"] = [];
for (var key in moduleOverrides) {
    if (moduleOverrides.hasOwnProperty(key)) {
        Module[key] = moduleOverrides[key];
    }
}
var Runtime = {
    setTempRet0: function (value) {
        tempRet0 = value;
    },
    getTempRet0: function () {
        return tempRet0;
    },
    stackSave: function () {
        return STACKTOP;
    },
    stackRestore: function (stackTop) {
        STACKTOP = stackTop;
    },
    getNativeTypeSize: function (type) {
        switch (type) {
            case "i1":
            case "i8":
                return 1;
            case "i16":
                return 2;
            case "i32":
                return 4;
            case "i64":
                return 8;
            case "float":
                return 4;
            case "double":
                return 8;
            default: {
                if (type[type.length - 1] === "*") {
                    return Runtime.QUANTUM_SIZE;
                } else if (type[0] === "i") {
                    var bits = parseInt(type.substr(1));
                    assert(bits % 8 === 0);
                    return bits / 8;
                } else {
                    return 0;
                }
            }
        }
    },
    getNativeFieldSize: function (type) {
        return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
    },
    STACK_ALIGN: 16,
    getAlignSize: function (type, size, vararg) {
        if (!vararg && (type == "i64" || type == "double")) return 8;
        if (!type) return Math.min(size, 8);
        return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
    },
    dynCall: function (sig, ptr, args) {
        if (args && args.length) {
            if (!args.splice) args = Array.prototype.slice.call(args);
            args.splice(0, 0, ptr);
            return Module["dynCall_" + sig].apply(null, args);
        } else {
            return Module["dynCall_" + sig].call(null, ptr);
        }
    },
    functionPointers: [],
    addFunction: function (func) {
        for (var i = 0; i < Runtime.functionPointers.length; i++) {
            if (!Runtime.functionPointers[i]) {
                Runtime.functionPointers[i] = func;
                return 2 * (1 + i);
            }
        }
        throw "Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.";
    },
    removeFunction: function (index) {
        Runtime.functionPointers[(index - 2) / 2] = null;
    },
    getAsmConst: function (code, numArgs) {
        if (!Runtime.asmConstCache) Runtime.asmConstCache = {};
        var func = Runtime.asmConstCache[code];
        if (func) return func;
        var args = [];
        for (var i = 0; i < numArgs; i++) {
            args.push(String.fromCharCode(36) + i);
        }
        var source = Pointer_stringify(code);
        if (source[0] === '"') {
            if (source.indexOf('"', 1) === source.length - 1) {
                source = source.substr(1, source.length - 2);
            } else {
                abort("invalid EM_ASM input |" + source + "|. Please use EM_ASM(..code..) (no quotes) or EM_ASM({ ..code($0).. }, input) (to input values)");
            }
        }
        try {
            var evalled = eval("(function(Module, FS) { return function(" + args.join(",") + "){ " + source + " } })")(Module, typeof FS !== "undefined" ? FS : null);
        } catch (e) {
            Module.printErr("error in executing inline EM_ASM code: " + e + " on: \n\n" + source + "\n\nwith args |" + args + "| (make sure to use the right one out of EM_ASM, EM_ASM_ARGS, etc.)");
            throw e;
        }
        return (Runtime.asmConstCache[code] = evalled);
    },
    warnOnce: function (text) {
        if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
        if (!Runtime.warnOnce.shown[text]) {
            Runtime.warnOnce.shown[text] = 1;
            Module.printErr(text);
        }
    },
    funcWrappers: {},
    getFuncWrapper: function (func, sig) {
        assert(sig);
        if (!Runtime.funcWrappers[sig]) {
            Runtime.funcWrappers[sig] = {};
        }
        var sigCache = Runtime.funcWrappers[sig];
        if (!sigCache[func]) {
            sigCache[func] = function dynCall_wrapper() {
                return Runtime.dynCall(sig, func, arguments);
            };
        }
        return sigCache[func];
    },
    UTF8Processor: function () {
        var buffer = [];
        var needed = 0;
        this.processCChar = function (code) {
            code = code & 255;
            if (buffer.length == 0) {
                if ((code & 128) == 0) {
                    return String.fromCharCode(code);
                }
                buffer.push(code);
                if ((code & 224) == 192) {
                    needed = 1;
                } else if ((code & 240) == 224) {
                    needed = 2;
                } else {
                    needed = 3;
                }
                return "";
            }
            if (needed) {
                buffer.push(code);
                needed--;
                if (needed > 0) return "";
            }
            var c1 = buffer[0];
            var c2 = buffer[1];
            var c3 = buffer[2];
            var c4 = buffer[3];
            var ret;
            if (buffer.length == 2) {
                ret = String.fromCharCode(((c1 & 31) << 6) | (c2 & 63));
            } else if (buffer.length == 3) {
                ret = String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
            } else {
                var codePoint = ((c1 & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63);
                ret = String.fromCharCode((((codePoint - 65536) / 1024) | 0) + 55296, ((codePoint - 65536) % 1024) + 56320);
            }
            buffer.length = 0;
            return ret;
        };
        this.processJSString = function processJSString(string) {
            string = unescape(encodeURIComponent(string));
            var ret = [];
            for (var i = 0; i < string.length; i++) {
                ret.push(string.charCodeAt(i));
            }
            return ret;
        };
    },
    getCompilerSetting: function (name) {
        throw "You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work";
    },
    stackAlloc: function (size) {
        var ret = STACKTOP;
        STACKTOP = (STACKTOP + size) | 0;
        STACKTOP = (STACKTOP + 15) & -16;
        return ret;
    },
    staticAlloc: function (size) {
        var ret = STATICTOP;
        STATICTOP = (STATICTOP + size) | 0;
        STATICTOP = (STATICTOP + 15) & -16;
        return ret;
    },
    dynamicAlloc: function (size) {
        var ret = DYNAMICTOP;
        DYNAMICTOP = (DYNAMICTOP + size) | 0;
        DYNAMICTOP = (DYNAMICTOP + 15) & -16;
        if (DYNAMICTOP >= TOTAL_MEMORY) enlargeMemory();
        return ret;
    },
    alignMemory: function (size, quantum) {
        var ret = (size = Math.ceil(size / (quantum ? quantum : 16)) * (quantum ? quantum : 16));
        return ret;
    },
    makeBigInt: function (low, high, unsigned) {
        var ret = unsigned ? +(low >>> 0) + +(high >>> 0) * +4294967296 : +(low >>> 0) + +(high | 0) * +4294967296;
        return ret;
    },
    GLOBAL_BASE: 8,
    QUANTUM_SIZE: 4,
    __dummy__: 0,
};
Module["Runtime"] = Runtime;
var __THREW__ = 0;
var ABORT = false;
var EXITSTATUS = 0;
var undef = 0;
var tempValue, tempInt, tempBigInt, tempInt2, tempBigInt2, tempPair, tempBigIntI, tempBigIntR, tempBigIntS, tempBigIntP, tempBigIntD, tempDouble, tempFloat;
var tempI64, tempI64b;
var tempRet0, tempRet1, tempRet2, tempRet3, tempRet4, tempRet5, tempRet6, tempRet7, tempRet8, tempRet9;
function assert(condition, text) {
    if (!condition) {
        abort("Assertion failed: " + text);
    }
}
var globalScope = this;
function getCFunc(ident) {
    var func = Module["_" + ident];
    if (!func) {
        try {
            func = eval("_" + ident);
        } catch (e) {}
    }
    assert(func, "Cannot call unknown function " + ident + " (perhaps LLVM optimizations or closure removed it?)");
    return func;
}
var cwrap, ccall;
(function () {
    var JSfuncs = {
        stackSave: function () {
            Runtime.stackSave();
        },
        stackRestore: function () {
            Runtime.stackRestore();
        },
        arrayToC: function (arr) {
            var ret = Runtime.stackAlloc(arr.length);
            writeArrayToMemory(arr, ret);
            return ret;
        },
        stringToC: function (str) {
            var ret = 0;
            if (str !== null && str !== undefined && str !== 0) {
                ret = Runtime.stackAlloc((str.length << 2) + 1);
                writeStringToMemory(str, ret);
            }
            return ret;
        },
    };
    var toC = { string: JSfuncs["stringToC"], array: JSfuncs["arrayToC"] };
    ccall = function ccallFunc(ident, returnType, argTypes, args) {
        var func = getCFunc(ident);
        var cArgs = [];
        var stack = 0;
        if (args) {
            for (var i = 0; i < args.length; i++) {
                var converter = toC[argTypes[i]];
                if (converter) {
                    if (stack === 0) stack = Runtime.stackSave();
                    cArgs[i] = converter(args[i]);
                } else {
                    cArgs[i] = args[i];
                }
            }
        }
        var ret = func.apply(null, cArgs);
        if (returnType === "string") ret = Pointer_stringify(ret);
        if (stack !== 0) Runtime.stackRestore(stack);
        return ret;
    };
    var sourceRegex = /^function\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
    function parseJSFunc(jsfunc) {
        var parsed = jsfunc.toString().match(sourceRegex).slice(1);
        return { arguments: parsed[0], body: parsed[1], returnValue: parsed[2] };
    }
    var JSsource = {};
    for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
            JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
    }
    cwrap = function cwrap(ident, returnType, argTypes) {
        argTypes = argTypes || [];
        var cfunc = getCFunc(ident);
        var numericArgs = argTypes.every(function (type) {
            return type === "number";
        });
        var numericRet = returnType !== "string";
        if (numericRet && numericArgs) {
            return cfunc;
        }
        var argNames = argTypes.map(function (x, i) {
            return "$" + i;
        });
        var funcstr = "(function(" + argNames.join(",") + ") {";
        var nargs = argTypes.length;
        if (!numericArgs) {
            funcstr += "var stack = " + JSsource["stackSave"].body + ";";
            for (var i = 0; i < nargs; i++) {
                var arg = argNames[i],
                    type = argTypes[i];
                if (type === "number") continue;
                var convertCode = JSsource[type + "ToC"];
                funcstr += "var " + convertCode.arguments + " = " + arg + ";";
                funcstr += convertCode.body + ";";
                funcstr += arg + "=" + convertCode.returnValue + ";";
            }
        }
        var cfuncname = parseJSFunc(function () {
            return cfunc;
        }).returnValue;
        funcstr += "var ret = " + cfuncname + "(" + argNames.join(",") + ");";
        if (!numericRet) {
            var strgfy = parseJSFunc(function () {
                return Pointer_stringify;
            }).returnValue;
            funcstr += "ret = " + strgfy + "(ret);";
        }
        if (!numericArgs) {
            funcstr += JSsource["stackRestore"].body.replace("()", "(stack)") + ";";
        }
        funcstr += "return ret})";
        return eval(funcstr);
    };
})();
Module["cwrap"] = cwrap;
Module["ccall"] = ccall;
function setValue(ptr, value, type, noSafe) {
    type = type || "i8";
    if (type.charAt(type.length - 1) === "*") type = "i32";
    switch (type) {
        case "i1":
            HEAP8[ptr >> 0] = value;
            break;
        case "i8":
            HEAP8[ptr >> 0] = value;
            break;
        case "i16":
            HEAP16[ptr >> 1] = value;
            break;
        case "i32":
            HEAP32[ptr >> 2] = value;
            break;
        case "i64":
            (tempI64 = [
                value >>> 0,
                ((tempDouble = value), +Math_abs(tempDouble) >= +1 ? (tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0) : 0),
            ]),
                (HEAP32[ptr >> 2] = tempI64[0]),
                (HEAP32[(ptr + 4) >> 2] = tempI64[1]);
            break;
        case "float":
            HEAPF32[ptr >> 2] = value;
            break;
        case "double":
            HEAPF64[ptr >> 3] = value;
            break;
        default:
            abort("invalid type for setValue: " + type);
    }
}
Module["setValue"] = setValue;
function getValue(ptr, type, noSafe) {
    type = type || "i8";
    if (type.charAt(type.length - 1) === "*") type = "i32";
    switch (type) {
        case "i1":
            return HEAP8[ptr >> 0];
        case "i8":
            return HEAP8[ptr >> 0];
        case "i16":
            return HEAP16[ptr >> 1];
        case "i32":
            return HEAP32[ptr >> 2];
        case "i64":
            return HEAP32[ptr >> 2];
        case "float":
            return HEAPF32[ptr >> 2];
        case "double":
            return HEAPF64[ptr >> 3];
        default:
            abort("invalid type for setValue: " + type);
    }
    return null;
}
Module["getValue"] = getValue;
var ALLOC_NORMAL = 0;
var ALLOC_STACK = 1;
var ALLOC_STATIC = 2;
var ALLOC_DYNAMIC = 3;
var ALLOC_NONE = 4;
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;
function allocate(slab, types, allocator, ptr) {
    var zeroinit, size;
    if (typeof slab === "number") {
        zeroinit = true;
        size = slab;
    } else {
        zeroinit = false;
        size = slab.length;
    }
    var singleType = typeof types === "string" ? types : null;
    var ret;
    if (allocator == ALLOC_NONE) {
        ret = ptr;
    } else {
        ret = [_malloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
    }
    if (zeroinit) {
        var ptr = ret,
            stop;
        assert((ret & 3) == 0);
        stop = ret + (size & ~3);
        for (; ptr < stop; ptr += 4) {
            HEAP32[ptr >> 2] = 0;
        }
        stop = ret + size;
        while (ptr < stop) {
            HEAP8[ptr++ >> 0] = 0;
        }
        return ret;
    }
    if (singleType === "i8") {
        if (slab.subarray || slab.slice) {
            HEAPU8.set(slab, ret);
        } else {
            HEAPU8.set(new Uint8Array(slab), ret);
        }
        return ret;
    }
    var i = 0,
        type,
        typeSize,
        previousType;
    while (i < size) {
        var curr = slab[i];
        if (typeof curr === "function") {
            curr = Runtime.getFunctionIndex(curr);
        }
        type = singleType || types[i];
        if (type === 0) {
            i++;
            continue;
        }
        if (type == "i64") type = "i32";
        setValue(ret + i, curr, type);
        if (previousType !== type) {
            typeSize = Runtime.getNativeTypeSize(type);
            previousType = type;
        }
        i += typeSize;
    }
    return ret;
}
Module["allocate"] = allocate;
function Pointer_stringify(ptr, length) {
    if (length === 0 || !ptr) return "";
    var hasUtf = false;
    var t;
    var i = 0;
    while (1) {
        t = HEAPU8[(ptr + i) >> 0];
        if (t >= 128) hasUtf = true;
        else if (t == 0 && !length) break;
        i++;
        if (length && i == length) break;
    }
    if (!length) length = i;
    var ret = "";
    if (!hasUtf) {
        var MAX_CHUNK = 1024;
        var curr;
        while (length > 0) {
            curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
            ret = ret ? ret + curr : curr;
            ptr += MAX_CHUNK;
            length -= MAX_CHUNK;
        }
        return ret;
    }
    var utf8 = new Runtime.UTF8Processor();
    for (i = 0; i < length; i++) {
        t = HEAPU8[(ptr + i) >> 0];
        ret += utf8.processCChar(t);
    }
    return ret;
}
Module["Pointer_stringify"] = Pointer_stringify;
function UTF16ToString(ptr) {
    var i = 0;
    var str = "";
    while (1) {
        var codeUnit = HEAP16[(ptr + i * 2) >> 1];
        if (codeUnit == 0) return str;
        ++i;
        str += String.fromCharCode(codeUnit);
    }
}
Module["UTF16ToString"] = UTF16ToString;
function stringToUTF16(str, outPtr) {
    for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i);
        HEAP16[(outPtr + i * 2) >> 1] = codeUnit;
    }
    HEAP16[(outPtr + str.length * 2) >> 1] = 0;
}
Module["stringToUTF16"] = stringToUTF16;
function UTF32ToString(ptr) {
    var i = 0;
    var str = "";
    while (1) {
        var utf32 = HEAP32[(ptr + i * 4) >> 2];
        if (utf32 == 0) return str;
        ++i;
        if (utf32 >= 65536) {
            var ch = utf32 - 65536;
            str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
        } else {
            str += String.fromCharCode(utf32);
        }
    }
}
Module["UTF32ToString"] = UTF32ToString;
function stringToUTF32(str, outPtr) {
    var iChar = 0;
    for (var iCodeUnit = 0; iCodeUnit < str.length; ++iCodeUnit) {
        var codeUnit = str.charCodeAt(iCodeUnit);
        if (codeUnit >= 55296 && codeUnit <= 57343) {
            var trailSurrogate = str.charCodeAt(++iCodeUnit);
            codeUnit = (65536 + ((codeUnit & 1023) << 10)) | (trailSurrogate & 1023);
        }
        HEAP32[(outPtr + iChar * 4) >> 2] = codeUnit;
        ++iChar;
    }
    HEAP32[(outPtr + iChar * 4) >> 2] = 0;
}
Module["stringToUTF32"] = stringToUTF32;
function demangle(func) {
    var hasLibcxxabi = !!Module["___cxa_demangle"];
    if (hasLibcxxabi) {
        try {
            var buf = _malloc(func.length);
            writeStringToMemory(func.substr(1), buf);
            var status = _malloc(4);
            var ret = Module["___cxa_demangle"](buf, 0, 0, status);
            if (getValue(status, "i32") === 0 && ret) {
                return Pointer_stringify(ret);
            }
        } catch (e) {
        } finally {
            if (buf) _free(buf);
            if (status) _free(status);
            if (ret) _free(ret);
        }
    }
    var i = 3;
    var basicTypes = {
        v: "void",
        b: "bool",
        c: "char",
        s: "short",
        i: "int",
        l: "long",
        f: "float",
        d: "double",
        w: "wchar_t",
        a: "signed char",
        h: "unsigned char",
        t: "unsigned short",
        j: "unsigned int",
        m: "unsigned long",
        x: "long long",
        y: "unsigned long long",
        z: "...",
    };
    var subs = [];
    var first = true;
    function dump(x) {
        if (x) Module.print(x);
        Module.print(func);
        var pre = "";
        for (var a = 0; a < i; a++) pre += " ";
        Module.print(pre + "^");
    }
    function parseNested() {
        i++;
        if (func[i] === "K") i++;
        var parts = [];
        while (func[i] !== "E") {
            if (func[i] === "S") {
                i++;
                var next = func.indexOf("_", i);
                var num = func.substring(i, next) || 0;
                parts.push(subs[num] || "?");
                i = next + 1;
                continue;
            }
            if (func[i] === "C") {
                parts.push(parts[parts.length - 1]);
                i += 2;
                continue;
            }
            var size = parseInt(func.substr(i));
            var pre = size.toString().length;
            if (!size || !pre) {
                i--;
                break;
            }
            var curr = func.substr(i + pre, size);
            parts.push(curr);
            subs.push(curr);
            i += pre + size;
        }
        i++;
        return parts;
    }
    function parse(rawList, limit, allowVoid) {
        limit = limit || Infinity;
        var ret = "",
            list = [];
        function flushList() {
            return "(" + list.join(", ") + ")";
        }
        var name;
        if (func[i] === "N") {
            name = parseNested().join("::");
            limit--;
            if (limit === 0) return rawList ? [name] : name;
        } else {
            if (func[i] === "K" || (first && func[i] === "L")) i++;
            var size = parseInt(func.substr(i));
            if (size) {
                var pre = size.toString().length;
                name = func.substr(i + pre, size);
                i += pre + size;
            }
        }
        first = false;
        if (func[i] === "I") {
            i++;
            var iList = parse(true);
            var iRet = parse(true, 1, true);
            ret += iRet[0] + " " + name + "<" + iList.join(", ") + ">";
        } else {
            ret = name;
        }
        paramLoop: while (i < func.length && limit-- > 0) {
            var c = func[i++];
            if (c in basicTypes) {
                list.push(basicTypes[c]);
            } else {
                switch (c) {
                    case "P":
                        list.push(parse(true, 1, true)[0] + "*");
                        break;
                    case "R":
                        list.push(parse(true, 1, true)[0] + "&");
                        break;
                    case "L": {
                        i++;
                        var end = func.indexOf("E", i);
                        var size = end - i;
                        list.push(func.substr(i, size));
                        i += size + 2;
                        break;
                    }
                    case "A": {
                        var size = parseInt(func.substr(i));
                        i += size.toString().length;
                        if (func[i] !== "_") throw "?";
                        i++;
                        list.push(parse(true, 1, true)[0] + " [" + size + "]");
                        break;
                    }
                    case "E":
                        break paramLoop;
                    default:
                        ret += "?" + c;
                        break paramLoop;
                }
            }
        }
        if (!allowVoid && list.length === 1 && list[0] === "void") list = [];
        if (rawList) {
            if (ret) {
                list.push(ret + "?");
            }
            return list;
        } else {
            return ret + flushList();
        }
    }
    var parsed = func;
    try {
        if (func == "Object._main" || func == "_main") {
            return "main()";
        }
        if (typeof func === "number") func = Pointer_stringify(func);
        if (func[0] !== "_") return func;
        if (func[1] !== "_") return func;
        if (func[2] !== "Z") return func;
        switch (func[3]) {
            case "n":
                return "operator new()";
            case "d":
                return "operator delete()";
        }
        parsed = parse();
    } catch (e) {
        parsed += "?";
    }
    if (parsed.indexOf("?") >= 0 && !hasLibcxxabi) {
        Runtime.warnOnce("warning: a problem occurred in builtin C++ name demangling; build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling");
    }
    return parsed;
}
function demangleAll(text) {
    return text.replace(/__Z[\w\d_]+/g, function (x) {
        var y = demangle(x);
        return x === y ? x : x + " [" + y + "]";
    });
}
function jsStackTrace() {
    var err = new Error();
    if (!err.stack) {
        try {
            throw new Error(0);
        } catch (e) {
            err = e;
        }
        if (!err.stack) {
            return "(no stack trace available)";
        }
    }
    return err.stack.toString();
}
function stackTrace() {
    return demangleAll(jsStackTrace());
}
Module["stackTrace"] = stackTrace;
var PAGE_SIZE = 4096;
function alignMemoryPage(x) {
    return (x + 4095) & -4096;
}
var HEAP;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
var STATIC_BASE = 0,
    STATICTOP = 0,
    staticSealed = false;
var STACK_BASE = 0,
    STACKTOP = 0,
    STACK_MAX = 0;
var DYNAMIC_BASE = 0,
    DYNAMICTOP = 0;
function enlargeMemory() {
    abort(
        "Cannot enlarge memory arrays. Either (1) compile with -s TOTAL_MEMORY=X with X higher than the current value " +
            TOTAL_MEMORY +
            ", (2) compile with ALLOW_MEMORY_GROWTH which adjusts the size at runtime but prevents some optimizations, or (3) set Module.TOTAL_MEMORY before the program runs."
    );
}
var TOTAL_STACK = Module["TOTAL_STACK"] || 5242880;
var TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 16777216;
var FAST_MEMORY = Module["FAST_MEMORY"] || 2097152;
var totalMemory = 64 * 1024;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2 * TOTAL_STACK) {
    if (totalMemory < 16 * 1024 * 1024) {
        totalMemory *= 2;
    } else {
        totalMemory += 16 * 1024 * 1024;
    }
}
if (totalMemory !== TOTAL_MEMORY) {
    Module.printErr("increasing TOTAL_MEMORY to " + totalMemory + " to be compliant with the asm.js spec");
    TOTAL_MEMORY = totalMemory;
}
assert(typeof Int32Array !== "undefined" && typeof Float64Array !== "undefined" && !!new Int32Array(1)["subarray"] && !!new Int32Array(1)["set"], "JS engine does not provide full typed array support");
var buffer = new ArrayBuffer(TOTAL_MEMORY);
HEAP8 = new Int8Array(buffer);
HEAP16 = new Int16Array(buffer);
HEAP32 = new Int32Array(buffer);
HEAPU8 = new Uint8Array(buffer);
HEAPU16 = new Uint16Array(buffer);
HEAPU32 = new Uint32Array(buffer);
HEAPF32 = new Float32Array(buffer);
HEAPF64 = new Float64Array(buffer);
HEAP32[0] = 255;
assert(HEAPU8[0] === 255 && HEAPU8[3] === 0, "Typed arrays 2 must be run on a little-endian system");
Module["HEAP"] = HEAP;
Module["buffer"] = buffer;
Module["HEAP8"] = HEAP8;
Module["HEAP16"] = HEAP16;
Module["HEAP32"] = HEAP32;
Module["HEAPU8"] = HEAPU8;
Module["HEAPU16"] = HEAPU16;
Module["HEAPU32"] = HEAPU32;
Module["HEAPF32"] = HEAPF32;
Module["HEAPF64"] = HEAPF64;
function callRuntimeCallbacks(callbacks) {
    while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == "function") {
            callback();
            continue;
        }
        var func = callback.func;
        if (typeof func === "number") {
            if (callback.arg === undefined) {
                Runtime.dynCall("v", func);
            } else {
                Runtime.dynCall("vi", func, [callback.arg]);
            }
        } else {
            func(callback.arg === undefined ? null : callback.arg);
        }
    }
}
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATEXIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;
function preRun() {
    if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
            addOnPreRun(Module["preRun"].shift());
        }
    }
    callRuntimeCallbacks(__ATPRERUN__);
}
function ensureInitRuntime() {
    if (runtimeInitialized) return;
    runtimeInitialized = true;
    callRuntimeCallbacks(__ATINIT__);
}
function preMain() {
    callRuntimeCallbacks(__ATMAIN__);
}
function exitRuntime() {
    callRuntimeCallbacks(__ATEXIT__);
    runtimeExited = true;
}
function postRun() {
    if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
            addOnPostRun(Module["postRun"].shift());
        }
    }
    callRuntimeCallbacks(__ATPOSTRUN__);
}
function addOnPreRun(cb) {
    __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = Module.addOnPreRun = addOnPreRun;
function addOnInit(cb) {
    __ATINIT__.unshift(cb);
}
Module["addOnInit"] = Module.addOnInit = addOnInit;
function addOnPreMain(cb) {
    __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = Module.addOnPreMain = addOnPreMain;
function addOnExit(cb) {
    __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = Module.addOnExit = addOnExit;
function addOnPostRun(cb) {
    __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = Module.addOnPostRun = addOnPostRun;
function intArrayFromString(stringy, dontAddNull, length) {
    var ret = new Runtime.UTF8Processor().processJSString(stringy);
    if (length) {
        ret.length = length;
    }
    if (!dontAddNull) {
        ret.push(0);
    }
    return ret;
}
Module["intArrayFromString"] = intArrayFromString;
function intArrayToString(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
        var chr = array[i];
        if (chr > 255) {
            chr &= 255;
        }
        ret.push(String.fromCharCode(chr));
    }
    return ret.join("");
}
Module["intArrayToString"] = intArrayToString;
function writeStringToMemory(string, buffer, dontAddNull) {
    var array = intArrayFromString(string, dontAddNull);
    var i = 0;
    while (i < array.length) {
        var chr = array[i];
        HEAP8[(buffer + i) >> 0] = chr;
        i = i + 1;
    }
}
Module["writeStringToMemory"] = writeStringToMemory;
function writeArrayToMemory(array, buffer) {
    for (var i = 0; i < array.length; i++) {
        HEAP8[(buffer + i) >> 0] = array[i];
    }
}
Module["writeArrayToMemory"] = writeArrayToMemory;
function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; i++) {
        HEAP8[(buffer + i) >> 0] = str.charCodeAt(i);
    }
    if (!dontAddNull) HEAP8[(buffer + str.length) >> 0] = 0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;
function unSign(value, bits, ignore) {
    if (value >= 0) {
        return value;
    }
    return bits <= 32 ? 2 * Math.abs(1 << (bits - 1)) + value : Math.pow(2, bits) + value;
}
function reSign(value, bits, ignore) {
    if (value <= 0) {
        return value;
    }
    var half = bits <= 32 ? Math.abs(1 << (bits - 1)) : Math.pow(2, bits - 1);
    if (value >= half && (bits <= 32 || value > half)) {
        value = -2 * half + value;
    }
    return value;
}
if (!Math["imul"] || Math["imul"](4294967295, 5) !== -5)
    Math["imul"] = function imul(a, b) {
        var ah = a >>> 16;
        var al = a & 65535;
        var bh = b >>> 16;
        var bl = b & 65535;
        return (al * bl + ((ah * bl + al * bh) << 16)) | 0;
    };
Math.imul = Math["imul"];
var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_min = Math.min;
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;
function addRunDependency(id) {
    runDependencies++;
    if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies);
    }
}
Module["addRunDependency"] = addRunDependency;
function removeRunDependency(id) {
    runDependencies--;
    if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies);
    }
    if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
            var callback = dependenciesFulfilled;
            dependenciesFulfilled = null;
            callback();
        }
    }
}
Module["removeRunDependency"] = removeRunDependency;
Module["preloadedImages"] = {};
Module["preloadedAudios"] = {};
var memoryInitializer = null;
STATIC_BASE = 8;
STATICTOP = STATIC_BASE + 9184;
__ATINIT__.push(
    {
        func: function () {
            __GLOBAL__I_a();
        },
    },
    {
        func: function () {
            __GLOBAL__I_a327();
        },
    }
);
var memoryInitializer = "twenty-engine.js.mem";
var tempDoublePtr = Runtime.alignMemory(allocate(12, "i8", ALLOC_STATIC), 8);
assert(tempDoublePtr % 8 == 0);
function copyTempFloat(ptr) {
    HEAP8[tempDoublePtr] = HEAP8[ptr];
    HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
    HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
    HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3];
}
function copyTempDouble(ptr) {
    HEAP8[tempDoublePtr] = HEAP8[ptr];
    HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
    HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
    HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3];
    HEAP8[tempDoublePtr + 4] = HEAP8[ptr + 4];
    HEAP8[tempDoublePtr + 5] = HEAP8[ptr + 5];
    HEAP8[tempDoublePtr + 6] = HEAP8[ptr + 6];
    HEAP8[tempDoublePtr + 7] = HEAP8[ptr + 7];
}
var GL = {
    counter: 1,
    lastError: 0,
    buffers: [],
    mappedBuffers: {},
    programs: [],
    framebuffers: [],
    renderbuffers: [],
    textures: [],
    uniforms: [],
    shaders: [],
    vaos: [],
    contexts: [],
    byteSizeByTypeRoot: 5120,
    byteSizeByType: [1, 1, 2, 2, 4, 4, 4, 2, 3, 4, 8],
    programInfos: {},
    stringCache: {},
    packAlignment: 4,
    unpackAlignment: 4,
    init: function () {
        GL.miniTempBuffer = new Float32Array(GL.MINI_TEMP_BUFFER_SIZE);
        for (var i = 0; i < GL.MINI_TEMP_BUFFER_SIZE; i++) {
            GL.miniTempBufferViews[i] = GL.miniTempBuffer.subarray(0, i + 1);
        }
    },
    recordError: function recordError(errorCode) {
        if (!GL.lastError) {
            GL.lastError = errorCode;
        }
    },
    getNewId: function (table) {
        var ret = GL.counter++;
        for (var i = table.length; i < ret; i++) {
            table[i] = null;
        }
        return ret;
    },
    MINI_TEMP_BUFFER_SIZE: 16,
    miniTempBuffer: null,
    miniTempBufferViews: [0],
    getSource: function (shader, count, string, length) {
        var source = "";
        for (var i = 0; i < count; ++i) {
            var frag;
            if (length) {
                var len = HEAP32[(length + i * 4) >> 2];
                if (len < 0) {
                    frag = Pointer_stringify(HEAP32[(string + i * 4) >> 2]);
                } else {
                    frag = Pointer_stringify(HEAP32[(string + i * 4) >> 2], len);
                }
            } else {
                frag = Pointer_stringify(HEAP32[(string + i * 4) >> 2]);
            }
            source += frag;
        }
        return source;
    },
    computeImageSize: function (width, height, sizePerPixel, alignment) {
        function roundedToNextMultipleOf(x, y) {
            return Math.floor((x + y - 1) / y) * y;
        }
        var plainRowSize = width * sizePerPixel;
        var alignedRowSize = roundedToNextMultipleOf(plainRowSize, alignment);
        return height <= 0 ? 0 : (height - 1) * alignedRowSize + plainRowSize;
    },
    get: function (name_, p, type) {
        if (!p) {
            GL.recordError(1281);
            return;
        }
        var ret = undefined;
        switch (name_) {
            case 36346:
                ret = 1;
                break;
            case 36344:
                if (type !== "Integer") {
                    GL.recordError(1280);
                }
                return;
            case 36345:
                ret = 0;
                break;
            case 34466:
                var formats = GLctx.getParameter(34467);
                ret = formats.length;
                break;
            case 35738:
                ret = 5121;
                break;
            case 35739:
                ret = 6408;
                break;
        }
        if (ret === undefined) {
            var result = GLctx.getParameter(name_);
            switch (typeof result) {
                case "number":
                    ret = result;
                    break;
                case "boolean":
                    ret = result ? 1 : 0;
                    break;
                case "string":
                    GL.recordError(1280);
                    return;
                case "object":
                    if (result === null) {
                        switch (name_) {
                            case 34964:
                            case 35725:
                            case 34965:
                            case 36006:
                            case 36007:
                            case 32873:
                            case 34068: {
                                ret = 0;
                                break;
                            }
                            default: {
                                GL.recordError(1280);
                                return;
                            }
                        }
                    } else if (result instanceof Float32Array || result instanceof Uint32Array || result instanceof Int32Array || result instanceof Array) {
                        for (var i = 0; i < result.length; ++i) {
                            switch (type) {
                                case "Integer":
                                    HEAP32[(p + i * 4) >> 2] = result[i];
                                    break;
                                case "Float":
                                    HEAPF32[(p + i * 4) >> 2] = result[i];
                                    break;
                                case "Boolean":
                                    HEAP8[(p + i) >> 0] = result[i] ? 1 : 0;
                                    break;
                                default:
                                    throw "internal glGet error, bad type: " + type;
                            }
                        }
                        return;
                    } else if (result instanceof WebGLBuffer || result instanceof WebGLProgram || result instanceof WebGLFramebuffer || result instanceof WebGLRenderbuffer || result instanceof WebGLTexture) {
                        ret = result.name | 0;
                    } else {
                        GL.recordError(1280);
                        return;
                    }
                    break;
                default:
                    GL.recordError(1280);
                    return;
            }
        }
        switch (type) {
            case "Integer":
                HEAP32[p >> 2] = ret;
                break;
            case "Float":
                HEAPF32[p >> 2] = ret;
                break;
            case "Boolean":
                HEAP8[p >> 0] = ret ? 1 : 0;
                break;
            default:
                throw "internal glGet error, bad type: " + type;
        }
    },
    getTexPixelData: function (type, format, width, height, pixels, internalFormat) {
        var sizePerPixel;
        var numChannels;
        switch (format) {
            case 6406:
            case 6409:
            case 6402:
                numChannels = 1;
                break;
            case 6410:
            case 33319:
                numChannels = 2;
                break;
            case 6407:
                numChannels = 3;
                break;
            case 6408:
                numChannels = 4;
                break;
            default:
                GL.recordError(1280);
                return { pixels: null, internalFormat: 0 };
        }
        switch (type) {
            case 5121:
                sizePerPixel = numChannels * 1;
                break;
            case 5123:
            case 36193:
                sizePerPixel = numChannels * 2;
                break;
            case 5125:
            case 5126:
                sizePerPixel = numChannels * 4;
                break;
            case 34042:
                sizePerPixel = 4;
                break;
            case 33635:
            case 32819:
            case 32820:
                sizePerPixel = 2;
                break;
            default:
                GL.recordError(1280);
                return { pixels: null, internalFormat: 0 };
        }
        var bytes = GL.computeImageSize(width, height, sizePerPixel, GL.unpackAlignment);
        if (type == 5121) {
            pixels = HEAPU8.subarray(pixels, pixels + bytes);
        } else if (type == 5126) {
            pixels = HEAPF32.subarray(pixels >> 2, (pixels + bytes) >> 2);
        } else if (type == 5125 || type == 34042) {
            pixels = HEAPU32.subarray(pixels >> 2, (pixels + bytes) >> 2);
        } else {
            pixels = HEAPU16.subarray(pixels >> 1, (pixels + bytes) >> 1);
        }
        return { pixels: pixels, internalFormat: internalFormat };
    },
    validateBufferTarget: function (target) {
        switch (target) {
            case 34962:
            case 34963:
            case 36662:
            case 36663:
            case 35051:
            case 35052:
            case 35882:
            case 35982:
            case 35345:
                return true;
            default:
                return false;
        }
    },
    createContext: function (canvas, webGLContextAttributes) {
        if (typeof webGLContextAttributes.majorVersion === "undefined" && typeof webGLContextAttributes.minorVersion === "undefined") {
            webGLContextAttributes.majorVersion = 1;
            webGLContextAttributes.minorVersion = 0;
        }
        var ctx;
        var errorInfo = "?";
        function onContextCreationError(event) {
            errorInfo = event.statusMessage || errorInfo;
        }
        try {
            canvas.addEventListener("webglcontextcreationerror", onContextCreationError, false);
            try {
                if (webGLContextAttributes.majorVersion == 1 && webGLContextAttributes.minorVersion == 0) {
                    ctx = canvas.getContext("webgl", webGLContextAttributes) || canvas.getContext("experimental-webgl", webGLContextAttributes);
                } else if (webGLContextAttributes.majorVersion == 2 && webGLContextAttributes.minorVersion == 0) {
                    ctx = canvas.getContext("webgl2", webGLContextAttributes) || canvas.getContext("experimental-webgl2", webGLContextAttributes);
                } else {
                    throw "Unsupported WebGL context version " + majorVersion + "." + minorVersion + "!";
                }
            } finally {
                canvas.removeEventListener("webglcontextcreationerror", onContextCreationError, false);
            }
            if (!ctx) throw ":(";
        } catch (e) {
            Module.print("Could not create canvas: " + [errorInfo, e, JSON.stringify(webGLContextAttributes)]);
            return 0;
        }
        if (!ctx) return 0;
        return GL.registerContext(ctx, webGLContextAttributes);
    },
    registerContext: function (ctx, webGLContextAttributes) {
        var handle = GL.getNewId(GL.contexts);
        var context = { handle: handle, version: webGLContextAttributes.majorVersion, GLctx: ctx };
        if (ctx.canvas) ctx.canvas.GLctxObject = context;
        GL.contexts[handle] = context;
        if (typeof webGLContextAttributes["webGLContextAttributes"] === "undefined" || webGLContextAttributes.enableExtensionsByDefault) {
            GL.initExtensions(context);
        }
        return handle;
    },
    makeContextCurrent: function (contextHandle) {
        var context = GL.contexts[contextHandle];
        if (!context) return false;
        GLctx = Module.ctx = context.GLctx;
        GL.currentContext = context;
        return true;
    },
    getContext: function (contextHandle) {
        return GL.contexts[contextHandle];
    },
    deleteContext: function (contextHandle) {
        if (GL.currentContext === GL.contexts[contextHandle]) GL.currentContext = 0;
        if (typeof JSEvents === "object") JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].canvas);
        if (GL.contexts[contextHandle] && GL.contexts[contextHandle].GLctx.canvas) GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined;
        GL.contexts[contextHandle] = null;
    },
    initExtensions: function (context) {
        if (!context) context = GL.currentContext;
        if (context.initExtensionsDone) return;
        context.initExtensionsDone = true;
        var GLctx = context.GLctx;
        context.maxVertexAttribs = GLctx.getParameter(GLctx.MAX_VERTEX_ATTRIBS);
        context.compressionExt = GLctx.getExtension("WEBGL_compressed_texture_s3tc") || GLctx.getExtension("MOZ_WEBGL_compressed_texture_s3tc") || GLctx.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");
        context.anisotropicExt = GLctx.getExtension("EXT_texture_filter_anisotropic") || GLctx.getExtension("MOZ_EXT_texture_filter_anisotropic") || GLctx.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
        context.floatExt = GLctx.getExtension("OES_texture_float");
        context.instancedArraysExt = GLctx.getExtension("ANGLE_instanced_arrays");
        context.vaoExt = GLctx.getExtension("OES_vertex_array_object");
        if (context.version === 2) {
            context.drawBuffersExt = function (n, bufs) {
                GLctx.drawBuffers(n, bufs);
            };
        } else {
            var ext = GLctx.getExtension("WEBGL_draw_buffers");
            if (ext) {
                context.drawBuffersExt = function (n, bufs) {
                    ext.drawBuffersWEBGL(n, bufs);
                };
            }
        }
        var automaticallyEnabledExtensions = [
            "OES_texture_float",
            "OES_texture_half_float",
            "OES_standard_derivatives",
            "OES_vertex_array_object",
            "WEBGL_compressed_texture_s3tc",
            "WEBGL_depth_texture",
            "OES_element_index_uint",
            "EXT_texture_filter_anisotropic",
            "ANGLE_instanced_arrays",
            "OES_texture_float_linear",
            "OES_texture_half_float_linear",
            "WEBGL_compressed_texture_atc",
            "WEBGL_compressed_texture_pvrtc",
            "EXT_color_buffer_half_float",
            "WEBGL_color_buffer_float",
            "EXT_frag_depth",
            "EXT_sRGB",
            "WEBGL_draw_buffers",
            "WEBGL_shared_resources",
            "EXT_shader_texture_lod",
        ];
        function shouldEnableAutomatically(extension) {
            var ret = false;
            automaticallyEnabledExtensions.forEach(function (include) {
                if (ext.indexOf(include) != -1) {
                    ret = true;
                }
            });
            return ret;
        }
        GLctx.getSupportedExtensions().forEach(function (ext) {
            ext = ext.replace("MOZ_", "").replace("WEBKIT_", "");
            if (automaticallyEnabledExtensions.indexOf(ext) != -1) {
                GLctx.getExtension(ext);
            }
        });
    },
    populateUniformTable: function (program) {
        var p = GL.programs[program];
        GL.programInfos[program] = { uniforms: {}, maxUniformLength: 0, maxAttributeLength: -1 };
        var ptable = GL.programInfos[program];
        var utable = ptable.uniforms;
        var numUniforms = GLctx.getProgramParameter(p, GLctx.ACTIVE_UNIFORMS);
        for (var i = 0; i < numUniforms; ++i) {
            var u = GLctx.getActiveUniform(p, i);
            var name = u.name;
            ptable.maxUniformLength = Math.max(ptable.maxUniformLength, name.length + 1);
            if (name.indexOf("]", name.length - 1) !== -1) {
                var ls = name.lastIndexOf("[");
                name = name.slice(0, ls);
            }
            var loc = GLctx.getUniformLocation(p, name);
            var id = GL.getNewId(GL.uniforms);
            utable[name] = [u.size, id];
            GL.uniforms[id] = loc;
            for (var j = 1; j < u.size; ++j) {
                var n = name + "[" + j + "]";
                loc = GLctx.getUniformLocation(p, n);
                id = GL.getNewId(GL.uniforms);
                GL.uniforms[id] = loc;
            }
        }
    },
};
function _emscripten_glIsRenderbuffer(renderbuffer) {
    var rb = GL.renderbuffers[renderbuffer];
    if (!rb) return 0;
    return GLctx.isRenderbuffer(rb);
}
function _emscripten_glGetActiveAttrib(program, index, bufSize, length, size, type, name) {
    program = GL.programs[program];
    var info = GLctx.getActiveAttrib(program, index);
    if (!info) return;
    var infoname = info.name.slice(0, Math.max(0, bufSize - 1));
    if (bufSize > 0 && name) {
        writeStringToMemory(infoname, name);
        if (length) HEAP32[length >> 2] = infoname.length;
    } else {
        if (length) HEAP32[length >> 2] = 0;
    }
    if (size) HEAP32[size >> 2] = info.size;
    if (type) HEAP32[type >> 2] = info.type;
}
function _emscripten_glVertexAttrib3fv(index, v) {
    v = HEAPF32.subarray(v >> 2, (v + 12) >> 2);
    GLctx.vertexAttrib3fv(index, v);
}
function _emscripten_glLineWidth(x0) {
    GLctx.lineWidth(x0);
}
var ERRNO_CODES = {
    EPERM: 1,
    ENOENT: 2,
    ESRCH: 3,
    EINTR: 4,
    EIO: 5,
    ENXIO: 6,
    E2BIG: 7,
    ENOEXEC: 8,
    EBADF: 9,
    ECHILD: 10,
    EAGAIN: 11,
    EWOULDBLOCK: 11,
    ENOMEM: 12,
    EACCES: 13,
    EFAULT: 14,
    ENOTBLK: 15,
    EBUSY: 16,
    EEXIST: 17,
    EXDEV: 18,
    ENODEV: 19,
    ENOTDIR: 20,
    EISDIR: 21,
    EINVAL: 22,
    ENFILE: 23,
    EMFILE: 24,
    ENOTTY: 25,
    ETXTBSY: 26,
    EFBIG: 27,
    ENOSPC: 28,
    ESPIPE: 29,
    EROFS: 30,
    EMLINK: 31,
    EPIPE: 32,
    EDOM: 33,
    ERANGE: 34,
    ENOMSG: 42,
    EIDRM: 43,
    ECHRNG: 44,
    EL2NSYNC: 45,
    EL3HLT: 46,
    EL3RST: 47,
    ELNRNG: 48,
    EUNATCH: 49,
    ENOCSI: 50,
    EL2HLT: 51,
    EDEADLK: 35,
    ENOLCK: 37,
    EBADE: 52,
    EBADR: 53,
    EXFULL: 54,
    ENOANO: 55,
    EBADRQC: 56,
    EBADSLT: 57,
    EDEADLOCK: 35,
    EBFONT: 59,
    ENOSTR: 60,
    ENODATA: 61,
    ETIME: 62,
    ENOSR: 63,
    ENONET: 64,
    ENOPKG: 65,
    EREMOTE: 66,
    ENOLINK: 67,
    EADV: 68,
    ESRMNT: 69,
    ECOMM: 70,
    EPROTO: 71,
    EMULTIHOP: 72,
    EDOTDOT: 73,
    EBADMSG: 74,
    ENOTUNIQ: 76,
    EBADFD: 77,
    EREMCHG: 78,
    ELIBACC: 79,
    ELIBBAD: 80,
    ELIBSCN: 81,
    ELIBMAX: 82,
    ELIBEXEC: 83,
    ENOSYS: 38,
    ENOTEMPTY: 39,
    ENAMETOOLONG: 36,
    ELOOP: 40,
    EOPNOTSUPP: 95,
    EPFNOSUPPORT: 96,
    ECONNRESET: 104,
    ENOBUFS: 105,
    EAFNOSUPPORT: 97,
    EPROTOTYPE: 91,
    ENOTSOCK: 88,
    ENOPROTOOPT: 92,
    ESHUTDOWN: 108,
    ECONNREFUSED: 111,
    EADDRINUSE: 98,
    ECONNABORTED: 103,
    ENETUNREACH: 101,
    ENETDOWN: 100,
    ETIMEDOUT: 110,
    EHOSTDOWN: 112,
    EHOSTUNREACH: 113,
    EINPROGRESS: 115,
    EALREADY: 114,
    EDESTADDRREQ: 89,
    EMSGSIZE: 90,
    EPROTONOSUPPORT: 93,
    ESOCKTNOSUPPORT: 94,
    EADDRNOTAVAIL: 99,
    ENETRESET: 102,
    EISCONN: 106,
    ENOTCONN: 107,
    ETOOMANYREFS: 109,
    EUSERS: 87,
    EDQUOT: 122,
    ESTALE: 116,
    ENOTSUP: 95,
    ENOMEDIUM: 123,
    EILSEQ: 84,
    EOVERFLOW: 75,
    ECANCELED: 125,
    ENOTRECOVERABLE: 131,
    EOWNERDEAD: 130,
    ESTRPIPE: 86,
};
var ERRNO_MESSAGES = {
    0: "Success",
    1: "Not super-user",
    2: "No such file or directory",
    3: "No such process",
    4: "Interrupted system call",
    5: "I/O error",
    6: "No such device or address",
    7: "Arg list too long",
    8: "Exec format error",
    9: "Bad file number",
    10: "No children",
    11: "No more processes",
    12: "Not enough core",
    13: "Permission denied",
    14: "Bad address",
    15: "Block device required",
    16: "Mount device busy",
    17: "File exists",
    18: "Cross-device link",
    19: "No such device",
    20: "Not a directory",
    21: "Is a directory",
    22: "Invalid argument",
    23: "Too many open files in system",
    24: "Too many open files",
    25: "Not a typewriter",
    26: "Text file busy",
    27: "File too large",
    28: "No space left on device",
    29: "Illegal seek",
    30: "Read only file system",
    31: "Too many links",
    32: "Broken pipe",
    33: "Math arg out of domain of func",
    34: "Math result not representable",
    35: "File locking deadlock error",
    36: "File or path name too long",
    37: "No record locks available",
    38: "Function not implemented",
    39: "Directory not empty",
    40: "Too many symbolic links",
    42: "No message of desired type",
    43: "Identifier removed",
    44: "Channel number out of range",
    45: "Level 2 not synchronized",
    46: "Level 3 halted",
    47: "Level 3 reset",
    48: "Link number out of range",
    49: "Protocol driver not attached",
    50: "No CSI structure available",
    51: "Level 2 halted",
    52: "Invalid exchange",
    53: "Invalid request descriptor",
    54: "Exchange full",
    55: "No anode",
    56: "Invalid request code",
    57: "Invalid slot",
    59: "Bad font file fmt",
    60: "Device not a stream",
    61: "No data (for no delay io)",
    62: "Timer expired",
    63: "Out of streams resources",
    64: "Machine is not on the network",
    65: "Package not installed",
    66: "The object is remote",
    67: "The link has been severed",
    68: "Advertise error",
    69: "Srmount error",
    70: "Communication error on send",
    71: "Protocol error",
    72: "Multihop attempted",
    73: "Cross mount point (not really error)",
    74: "Trying to read unreadable message",
    75: "Value too large for defined data type",
    76: "Given log. name not unique",
    77: "f.d. invalid for this operation",
    78: "Remote address changed",
    79: "Can   access a needed shared lib",
    80: "Accessing a corrupted shared lib",
    81: ".lib section in a.out corrupted",
    82: "Attempting to link in too many libs",
    83: "Attempting to exec a shared library",
    84: "Illegal byte sequence",
    86: "Streams pipe error",
    87: "Too many users",
    88: "Socket operation on non-socket",
    89: "Destination address required",
    90: "Message too long",
    91: "Protocol wrong type for socket",
    92: "Protocol not available",
    93: "Unknown protocol",
    94: "Socket type not supported",
    95: "Not supported",
    96: "Protocol family not supported",
    97: "Address family not supported by protocol family",
    98: "Address already in use",
    99: "Address not available",
    100: "Network interface is not configured",
    101: "Network is unreachable",
    102: "Connection reset by network",
    103: "Connection aborted",
    104: "Connection reset by peer",
    105: "No buffer space available",
    106: "Socket is already connected",
    107: "Socket is not connected",
    108: "Can't send after socket shutdown",
    109: "Too many references",
    110: "Connection timed out",
    111: "Connection refused",
    112: "Host is down",
    113: "Host is unreachable",
    114: "Socket already connected",
    115: "Connection already in progress",
    116: "Stale file handle",
    122: "Quota exceeded",
    123: "No medium (in tape drive)",
    125: "Operation canceled",
    130: "Previous owner died",
    131: "State not recoverable",
};
var ___errno_state = 0;
function ___setErrNo(value) {
    HEAP32[___errno_state >> 2] = value;
    return value;
}
var PATH = {
    splitPath: function (filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
    },
    normalizeArray: function (parts, allowAboveRoot) {
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
            var last = parts[i];
            if (last === ".") {
                parts.splice(i, 1);
            } else if (last === "..") {
                parts.splice(i, 1);
                up++;
            } else if (up) {
                parts.splice(i, 1);
                up--;
            }
        }
        if (allowAboveRoot) {
            for (; up--; up) {
                parts.unshift("..");
            }
        }
        return parts;
    },
    normalize: function (path) {
        var isAbsolute = path.charAt(0) === "/",
            trailingSlash = path.substr(-1) === "/";
        path = PATH.normalizeArray(
            path.split("/").filter(function (p) {
                return !!p;
            }),
            !isAbsolute
        ).join("/");
        if (!path && !isAbsolute) {
            path = ".";
        }
        if (path && trailingSlash) {
            path += "/";
        }
        return (isAbsolute ? "/" : "") + path;
    },
    dirname: function (path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
            return ".";
        }
        if (dir) {
            dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
    },
    basename: function (path) {
        if (path === "/") return "/";
        var lastSlash = path.lastIndexOf("/");
        if (lastSlash === -1) return path;
        return path.substr(lastSlash + 1);
    },
    extname: function (path) {
        return PATH.splitPath(path)[3];
    },
    join: function () {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join("/"));
    },
    join2: function (l, r) {
        return PATH.normalize(l + "/" + r);
    },
    resolve: function () {
        var resolvedPath = "",
            resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
            var path = i >= 0 ? arguments[i] : FS.cwd();
            if (typeof path !== "string") {
                throw new TypeError("Arguments to path.resolve must be strings");
            } else if (!path) {
                return "";
            }
            resolvedPath = path + "/" + resolvedPath;
            resolvedAbsolute = path.charAt(0) === "/";
        }
        resolvedPath = PATH.normalizeArray(
            resolvedPath.split("/").filter(function (p) {
                return !!p;
            }),
            !resolvedAbsolute
        ).join("/");
        return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
    },
    relative: function (from, to) {
        from = PATH.resolve(from).substr(1);
        to = PATH.resolve(to).substr(1);
        function trim(arr) {
            var start = 0;
            for (; start < arr.length; start++) {
                if (arr[start] !== "") break;
            }
            var end = arr.length - 1;
            for (; end >= 0; end--) {
                if (arr[end] !== "") break;
            }
            if (start > end) return [];
            return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split("/"));
        var toParts = trim(to.split("/"));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
            if (fromParts[i] !== toParts[i]) {
                samePartsLength = i;
                break;
            }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
            outputParts.push("..");
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join("/");
    },
};
var TTY = {
    ttys: [],
    init: function () {},
    shutdown: function () {},
    register: function (dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
    },
    stream_ops: {
        open: function (stream) {
            var tty = TTY.ttys[stream.node.rdev];
            if (!tty) {
                throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
            }
            stream.tty = tty;
            stream.seekable = false;
        },
        close: function (stream) {
            stream.tty.ops.flush(stream.tty);
        },
        flush: function (stream) {
            stream.tty.ops.flush(stream.tty);
        },
        read: function (stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.get_char) {
                throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
            }
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
                var result;
                try {
                    result = stream.tty.ops.get_char(stream.tty);
                } catch (e) {
                    throw new FS.ErrnoError(ERRNO_CODES.EIO);
                }
                if (result === undefined && bytesRead === 0) {
                    throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
                }
                if (result === null || result === undefined) break;
                bytesRead++;
                buffer[offset + i] = result;
            }
            if (bytesRead) {
                stream.node.timestamp = Date.now();
            }
            return bytesRead;
        },
        write: function (stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.put_char) {
                throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
            }
            for (var i = 0; i < length; i++) {
                try {
                    stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
                } catch (e) {
                    throw new FS.ErrnoError(ERRNO_CODES.EIO);
                }
            }
            if (length) {
                stream.node.timestamp = Date.now();
            }
            return i;
        },
    },
    default_tty_ops: {
        get_char: function (tty) {
            if (!tty.input.length) {
                var result = null;
                if (ENVIRONMENT_IS_NODE) {
                    result = process["stdin"]["read"]();
                    if (!result) {
                        if (process["stdin"]["_readableState"] && process["stdin"]["_readableState"]["ended"]) {
                            return null;
                        }
                        return undefined;
                    }
                } else if (typeof window != "undefined" && typeof window.prompt == "function") {
                    result = window.prompt("Input: ");
                    if (result !== null) {
                        result += "\n";
                    }
                } else if (typeof readline == "function") {
                    result = readline();
                    if (result !== null) {
                        result += "\n";
                    }
                }
                if (!result) {
                    return null;
                }
                tty.input = intArrayFromString(result, true);
            }
            return tty.input.shift();
        },
        flush: function (tty) {
            if (tty.output && tty.output.length > 0) {
                Module["print"](tty.output.join(""));
                tty.output = [];
            }
        },
        put_char: function (tty, val) {
            if (val === null || val === 10) {
                Module["print"](tty.output.join(""));
                tty.output = [];
            } else {
                tty.output.push(TTY.utf8.processCChar(val));
            }
        },
    },
    default_tty1_ops: {
        put_char: function (tty, val) {
            if (val === null || val === 10) {
                Module["printErr"](tty.output.join(""));
                tty.output = [];
            } else {
                tty.output.push(TTY.utf8.processCChar(val));
            }
        },
        flush: function (tty) {
            if (tty.output && tty.output.length > 0) {
                Module["printErr"](tty.output.join(""));
                tty.output = [];
            }
        },
    },
};
var MEMFS = {
    ops_table: null,
    mount: function (mount) {
        return MEMFS.createNode(null, "/", 16384 | 511, 0);
    },
    createNode: function (parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (!MEMFS.ops_table) {
            MEMFS.ops_table = {
                dir: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr,
                        lookup: MEMFS.node_ops.lookup,
                        mknod: MEMFS.node_ops.mknod,
                        rename: MEMFS.node_ops.rename,
                        unlink: MEMFS.node_ops.unlink,
                        rmdir: MEMFS.node_ops.rmdir,
                        readdir: MEMFS.node_ops.readdir,
                        symlink: MEMFS.node_ops.symlink,
                    },
                    stream: { llseek: MEMFS.stream_ops.llseek },
                },
                file: {
                    node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr },
                    stream: { llseek: MEMFS.stream_ops.llseek, read: MEMFS.stream_ops.read, write: MEMFS.stream_ops.write, allocate: MEMFS.stream_ops.allocate, mmap: MEMFS.stream_ops.mmap },
                },
                link: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr, readlink: MEMFS.node_ops.readlink }, stream: {} },
                chrdev: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr }, stream: FS.chrdev_stream_ops },
            };
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
            node.node_ops = MEMFS.ops_table.dir.node;
            node.stream_ops = MEMFS.ops_table.dir.stream;
            node.contents = {};
        } else if (FS.isFile(node.mode)) {
            node.node_ops = MEMFS.ops_table.file.node;
            node.stream_ops = MEMFS.ops_table.file.stream;
            node.usedBytes = 0;
            node.contents = null;
        } else if (FS.isLink(node.mode)) {
            node.node_ops = MEMFS.ops_table.link.node;
            node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
            node.node_ops = MEMFS.ops_table.chrdev.node;
            node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        if (parent) {
            parent.contents[name] = node;
        }
        return node;
    },
    getFileDataAsRegularArray: function (node) {
        if (node.contents && node.contents.subarray) {
            var arr = [];
            for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
            return arr;
        }
        return node.contents;
    },
    getFileDataAsTypedArray: function (node) {
        if (!node.contents) return new Uint8Array();
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
        return new Uint8Array(node.contents);
    },
    expandFileStorage: function (node, newCapacity) {
        if (node.contents && node.contents.subarray && newCapacity > node.contents.length) {
            node.contents = MEMFS.getFileDataAsRegularArray(node);
            node.usedBytes = node.contents.length;
        }
        if (!node.contents || node.contents.subarray) {
            var prevCapacity = node.contents ? node.contents.buffer.byteLength : 0;
            if (prevCapacity >= newCapacity) return;
            var CAPACITY_DOUBLING_MAX = 1024 * 1024;
            newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) | 0);
            if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
            var oldContents = node.contents;
            node.contents = new Uint8Array(newCapacity);
            if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
            return;
        }
        if (!node.contents && newCapacity > 0) node.contents = [];
        while (node.contents.length < newCapacity) node.contents.push(0);
    },
    resizeFileStorage: function (node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
            node.contents = null;
            node.usedBytes = 0;
            return;
        }
        if (!node.contents || node.contents.subarray) {
            var oldContents = node.contents;
            node.contents = new Uint8Array(new ArrayBuffer(newSize));
            if (oldContents) {
                node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
            }
            node.usedBytes = newSize;
            return;
        }
        if (!node.contents) node.contents = [];
        if (node.contents.length > newSize) node.contents.length = newSize;
        else while (node.contents.length < newSize) node.contents.push(0);
        node.usedBytes = newSize;
    },
    node_ops: {
        getattr: function (node) {
            var attr = {};
            attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
            attr.ino = node.id;
            attr.mode = node.mode;
            attr.nlink = 1;
            attr.uid = 0;
            attr.gid = 0;
            attr.rdev = node.rdev;
            if (FS.isDir(node.mode)) {
                attr.size = 4096;
            } else if (FS.isFile(node.mode)) {
                attr.size = node.usedBytes;
            } else if (FS.isLink(node.mode)) {
                attr.size = node.link.length;
            } else {
                attr.size = 0;
            }
            attr.atime = new Date(node.timestamp);
            attr.mtime = new Date(node.timestamp);
            attr.ctime = new Date(node.timestamp);
            attr.blksize = 4096;
            attr.blocks = Math.ceil(attr.size / attr.blksize);
            return attr;
        },
        setattr: function (node, attr) {
            if (attr.mode !== undefined) {
                node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
                node.timestamp = attr.timestamp;
            }
            if (attr.size !== undefined) {
                MEMFS.resizeFileStorage(node, attr.size);
            }
        },
        lookup: function (parent, name) {
            throw FS.genericErrors[ERRNO_CODES.ENOENT];
        },
        mknod: function (parent, name, mode, dev) {
            return MEMFS.createNode(parent, name, mode, dev);
        },
        rename: function (old_node, new_dir, new_name) {
            if (FS.isDir(old_node.mode)) {
                var new_node;
                try {
                    new_node = FS.lookupNode(new_dir, new_name);
                } catch (e) {}
                if (new_node) {
                    for (var i in new_node.contents) {
                        throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
                    }
                }
            }
            delete old_node.parent.contents[old_node.name];
            old_node.name = new_name;
            new_dir.contents[new_name] = old_node;
            old_node.parent = new_dir;
        },
        unlink: function (parent, name) {
            delete parent.contents[name];
        },
        rmdir: function (parent, name) {
            var node = FS.lookupNode(parent, name);
            for (var i in node.contents) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
            }
            delete parent.contents[name];
        },
        readdir: function (node) {
            var entries = [".", ".."];
            for (var key in node.contents) {
                if (!node.contents.hasOwnProperty(key)) {
                    continue;
                }
                entries.push(key);
            }
            return entries;
        },
        symlink: function (parent, newname, oldpath) {
            var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
            node.link = oldpath;
            return node;
        },
        readlink: function (node) {
            if (!FS.isLink(node.mode)) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
            return node.link;
        },
    },
    stream_ops: {
        read: function (stream, buffer, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= stream.node.usedBytes) return 0;
            var size = Math.min(stream.node.usedBytes - position, length);
            assert(size >= 0);
            if (size > 8 && contents.subarray) {
                buffer.set(contents.subarray(position, position + size), offset);
            } else {
                for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
            }
            return size;
        },
        write: function (stream, buffer, offset, length, position, canOwn) {
            if (!length) return 0;
            var node = stream.node;
            node.timestamp = Date.now();
            if (buffer.subarray && (!node.contents || node.contents.subarray)) {
                if (canOwn) {
                    node.contents = buffer.subarray(offset, offset + length);
                    node.usedBytes = length;
                    return length;
                } else if (node.usedBytes === 0 && position === 0) {
                    node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
                    node.usedBytes = length;
                    return length;
                } else if (position + length <= node.usedBytes) {
                    node.contents.set(buffer.subarray(offset, offset + length), position);
                    return length;
                }
            }
            MEMFS.expandFileStorage(node, position + length);
            if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position);
            else
                for (var i = 0; i < length; i++) {
                    node.contents[position + i] = buffer[offset + i];
                }
            node.usedBytes = Math.max(node.usedBytes, position + length);
            return length;
        },
        llseek: function (stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position;
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    position += stream.node.usedBytes;
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
            return position;
        },
        allocate: function (stream, offset, length) {
            MEMFS.expandFileStorage(stream.node, offset + length);
            stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },
        mmap: function (stream, buffer, offset, length, position, prot, flags) {
            if (!FS.isFile(stream.node.mode)) {
                throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
            }
            var ptr;
            var allocated;
            var contents = stream.node.contents;
            if (!(flags & 2) && (contents.buffer === buffer || contents.buffer === buffer.buffer)) {
                allocated = false;
                ptr = contents.byteOffset;
            } else {
                if (position > 0 || position + length < stream.node.usedBytes) {
                    if (contents.subarray) {
                        contents = contents.subarray(position, position + length);
                    } else {
                        contents = Array.prototype.slice.call(contents, position, position + length);
                    }
                }
                allocated = true;
                ptr = _malloc(length);
                if (!ptr) {
                    throw new FS.ErrnoError(ERRNO_CODES.ENOMEM);
                }
                buffer.set(contents, ptr);
            }
            return { ptr: ptr, allocated: allocated };
        },
    },
};
var IDBFS = {
    dbs: {},
    indexedDB: function () {
        if (typeof indexedDB !== "undefined") return indexedDB;
        var ret = null;
        if (typeof window === "object") ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, "IDBFS used, but indexedDB not supported");
        return ret;
    },
    DB_VERSION: 21,
    DB_STORE_NAME: "FILE_DATA",
    mount: function (mount) {
        return MEMFS.mount.apply(null, arguments);
    },
    syncfs: function (mount, populate, callback) {
        IDBFS.getLocalSet(mount, function (err, local) {
            if (err) return callback(err);
            IDBFS.getRemoteSet(mount, function (err, remote) {
                if (err) return callback(err);
                var src = populate ? remote : local;
                var dst = populate ? local : remote;
                IDBFS.reconcile(src, dst, callback);
            });
        });
    },
    getDB: function (name, callback) {
        var db = IDBFS.dbs[name];
        if (db) {
            return callback(null, db);
        }
        var req;
        try {
            req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
        } catch (e) {
            return callback(e);
        }
        req.onupgradeneeded = function (e) {
            var db = e.target.result;
            var transaction = e.target.transaction;
            var fileStore;
            if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
                fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
            } else {
                fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
            }
            fileStore.createIndex("timestamp", "timestamp", { unique: false });
        };
        req.onsuccess = function () {
            db = req.result;
            IDBFS.dbs[name] = db;
            callback(null, db);
        };
        req.onerror = function () {
            callback(this.error);
        };
    },
    getLocalSet: function (mount, callback) {
        var entries = {};
        function isRealDir(p) {
            return p !== "." && p !== "..";
        }
        function toAbsolute(root) {
            return function (p) {
                return PATH.join2(root, p);
            };
        }
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
        while (check.length) {
            var path = check.pop();
            var stat;
            try {
                stat = FS.stat(path);
            } catch (e) {
                return callback(e);
            }
            if (FS.isDir(stat.mode)) {
                check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
            }
            entries[path] = { timestamp: stat.mtime };
        }
        return callback(null, { type: "local", entries: entries });
    },
    getRemoteSet: function (mount, callback) {
        var entries = {};
        IDBFS.getDB(mount.mountpoint, function (err, db) {
            if (err) return callback(err);
            var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readonly");
            transaction.onerror = function () {
                callback(this.error);
            };
            var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
            var index = store.index("timestamp");
            index.openKeyCursor().onsuccess = function (event) {
                var cursor = event.target.result;
                if (!cursor) {
                    return callback(null, { type: "remote", db: db, entries: entries });
                }
                entries[cursor.primaryKey] = { timestamp: cursor.key };
                cursor.continue();
            };
        });
    },
    loadLocalEntry: function (path, callback) {
        var stat, node;
        try {
            var lookup = FS.lookupPath(path);
            node = lookup.node;
            stat = FS.stat(path);
        } catch (e) {
            return callback(e);
        }
        if (FS.isDir(stat.mode)) {
            return callback(null, { timestamp: stat.mtime, mode: stat.mode });
        } else if (FS.isFile(stat.mode)) {
            node.contents = MEMFS.getFileDataAsTypedArray(node);
            return callback(null, { timestamp: stat.mtime, mode: stat.mode, contents: node.contents });
        } else {
            return callback(new Error("node type not supported"));
        }
    },
    storeLocalEntry: function (path, entry, callback) {
        try {
            if (FS.isDir(entry.mode)) {
                FS.mkdir(path, entry.mode);
            } else if (FS.isFile(entry.mode)) {
                FS.writeFile(path, entry.contents, { encoding: "binary", canOwn: true });
            } else {
                return callback(new Error("node type not supported"));
            }
            FS.chmod(path, entry.mode);
            FS.utime(path, entry.timestamp, entry.timestamp);
        } catch (e) {
            return callback(e);
        }
        callback(null);
    },
    removeLocalEntry: function (path, callback) {
        try {
            var lookup = FS.lookupPath(path);
            var stat = FS.stat(path);
            if (FS.isDir(stat.mode)) {
                FS.rmdir(path);
            } else if (FS.isFile(stat.mode)) {
                FS.unlink(path);
            }
        } catch (e) {
            return callback(e);
        }
        callback(null);
    },
    loadRemoteEntry: function (store, path, callback) {
        var req = store.get(path);
        req.onsuccess = function (event) {
            callback(null, event.target.result);
        };
        req.onerror = function () {
            callback(this.error);
        };
    },
    storeRemoteEntry: function (store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = function () {
            callback(null);
        };
        req.onerror = function () {
            callback(this.error);
        };
    },
    removeRemoteEntry: function (store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = function () {
            callback(null);
        };
        req.onerror = function () {
            callback(this.error);
        };
    },
    reconcile: function (src, dst, callback) {
        var total = 0;
        var create = [];
        Object.keys(src.entries).forEach(function (key) {
            var e = src.entries[key];
            var e2 = dst.entries[key];
            if (!e2 || e.timestamp > e2.timestamp) {
                create.push(key);
                total++;
            }
        });
        var remove = [];
        Object.keys(dst.entries).forEach(function (key) {
            var e = dst.entries[key];
            var e2 = src.entries[key];
            if (!e2) {
                remove.push(key);
                total++;
            }
        });
        if (!total) {
            return callback(null);
        }
        var errored = false;
        var completed = 0;
        var db = src.type === "remote" ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readwrite");
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
        function done(err) {
            if (err) {
                if (!done.errored) {
                    done.errored = true;
                    return callback(err);
                }
                return;
            }
            if (++completed >= total) {
                return callback(null);
            }
        }
        transaction.onerror = function () {
            done(this.error);
        };
        create.sort().forEach(function (path) {
            if (dst.type === "local") {
                IDBFS.loadRemoteEntry(store, path, function (err, entry) {
                    if (err) return done(err);
                    IDBFS.storeLocalEntry(path, entry, done);
                });
            } else {
                IDBFS.loadLocalEntry(path, function (err, entry) {
                    if (err) return done(err);
                    IDBFS.storeRemoteEntry(store, path, entry, done);
                });
            }
        });
        remove
            .sort()
            .reverse()
            .forEach(function (path) {
                if (dst.type === "local") {
                    IDBFS.removeLocalEntry(path, done);
                } else {
                    IDBFS.removeRemoteEntry(store, path, done);
                }
            });
    },
};
var NODEFS = {
    isWindows: false,
    staticInit: function () {
        NODEFS.isWindows = !!process.platform.match(/^win/);
    },
    mount: function (mount) {
        assert(ENVIRONMENT_IS_NODE);
        return NODEFS.createNode(null, "/", NODEFS.getMode(mount.opts.root), 0);
    },
    createNode: function (parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node;
    },
    getMode: function (path) {
        var stat;
        try {
            stat = fs.lstatSync(path);
            if (NODEFS.isWindows) {
                stat.mode = stat.mode | ((stat.mode & 146) >> 1);
            }
        } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        return stat.mode;
    },
    realPath: function (node) {
        var parts = [];
        while (node.parent !== node) {
            parts.push(node.name);
            node = node.parent;
        }
        parts.push(node.mount.opts.root);
        parts.reverse();
        return PATH.join.apply(null, parts);
    },
    flagsToPermissionStringMap: {
        0: "r",
        1: "r+",
        2: "r+",
        64: "r",
        65: "r+",
        66: "r+",
        129: "rx+",
        193: "rx+",
        514: "w+",
        577: "w",
        578: "w+",
        705: "wx",
        706: "wx+",
        1024: "a",
        1025: "a",
        1026: "a+",
        1089: "a",
        1090: "a+",
        1153: "ax",
        1154: "ax+",
        1217: "ax",
        1218: "ax+",
        4096: "rs",
        4098: "rs+",
    },
    flagsToPermissionString: function (flags) {
        if (flags in NODEFS.flagsToPermissionStringMap) {
            return NODEFS.flagsToPermissionStringMap[flags];
        } else {
            return flags;
        }
    },
    node_ops: {
        getattr: function (node) {
            var path = NODEFS.realPath(node);
            var stat;
            try {
                stat = fs.lstatSync(path);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
            if (NODEFS.isWindows && !stat.blksize) {
                stat.blksize = 4096;
            }
            if (NODEFS.isWindows && !stat.blocks) {
                stat.blocks = ((stat.size + stat.blksize - 1) / stat.blksize) | 0;
            }
            return {
                dev: stat.dev,
                ino: stat.ino,
                mode: stat.mode,
                nlink: stat.nlink,
                uid: stat.uid,
                gid: stat.gid,
                rdev: stat.rdev,
                size: stat.size,
                atime: stat.atime,
                mtime: stat.mtime,
                ctime: stat.ctime,
                blksize: stat.blksize,
                blocks: stat.blocks,
            };
        },
        setattr: function (node, attr) {
            var path = NODEFS.realPath(node);
            try {
                if (attr.mode !== undefined) {
                    fs.chmodSync(path, attr.mode);
                    node.mode = attr.mode;
                }
                if (attr.timestamp !== undefined) {
                    var date = new Date(attr.timestamp);
                    fs.utimesSync(path, date, date);
                }
                if (attr.size !== undefined) {
                    fs.truncateSync(path, attr.size);
                }
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        lookup: function (parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            var mode = NODEFS.getMode(path);
            return NODEFS.createNode(parent, name, mode);
        },
        mknod: function (parent, name, mode, dev) {
            var node = NODEFS.createNode(parent, name, mode, dev);
            var path = NODEFS.realPath(node);
            try {
                if (FS.isDir(node.mode)) {
                    fs.mkdirSync(path, node.mode);
                } else {
                    fs.writeFileSync(path, "", { mode: node.mode });
                }
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
            return node;
        },
        rename: function (oldNode, newDir, newName) {
            var oldPath = NODEFS.realPath(oldNode);
            var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
            try {
                fs.renameSync(oldPath, newPath);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        unlink: function (parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            try {
                fs.unlinkSync(path);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        rmdir: function (parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            try {
                fs.rmdirSync(path);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        readdir: function (node) {
            var path = NODEFS.realPath(node);
            try {
                return fs.readdirSync(path);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        symlink: function (parent, newName, oldPath) {
            var newPath = PATH.join2(NODEFS.realPath(parent), newName);
            try {
                fs.symlinkSync(oldPath, newPath);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        readlink: function (node) {
            var path = NODEFS.realPath(node);
            try {
                return fs.readlinkSync(path);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
    },
    stream_ops: {
        open: function (stream) {
            var path = NODEFS.realPath(stream.node);
            try {
                if (FS.isFile(stream.node.mode)) {
                    stream.nfd = fs.openSync(path, NODEFS.flagsToPermissionString(stream.flags));
                }
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        close: function (stream) {
            try {
                if (FS.isFile(stream.node.mode) && stream.nfd) {
                    fs.closeSync(stream.nfd);
                }
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        read: function (stream, buffer, offset, length, position) {
            if (length === 0) return 0;
            var nbuffer = new Buffer(length);
            var res;
            try {
                res = fs.readSync(stream.nfd, nbuffer, 0, length, position);
            } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
            if (res > 0) {
                for (var i = 0; i < res; i++) {
                    buffer[offset + i] = nbuffer[i];
                }
            }
            return res;
        },
        write: function (stream, buffer, offset, length, position) {
            var nbuffer = new Buffer(buffer.subarray(offset, offset + length));
            var res;
            try {
                res = fs.writeSync(stream.nfd, nbuffer, 0, length, position);
            } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
            return res;
        },
        llseek: function (stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position;
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    try {
                        var stat = fs.fstatSync(stream.nfd);
                        position += stat.size;
                    } catch (e) {
                        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
                    }
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
            return position;
        },
    },
};
var _stdin = allocate(1, "i32*", ALLOC_STATIC);
var _stdout = allocate(1, "i32*", ALLOC_STATIC);
var _stderr = allocate(1, "i32*", ALLOC_STATIC);
function _fflush(stream) {}
var FS = {
    root: null,
    mounts: [],
    devices: [null],
    streams: [],
    nextInode: 1,
    nameTable: null,
    currentPath: "/",
    initialized: false,
    ignorePermissions: true,
    trackingDelegate: {},
    tracking: { openFlags: { READ: 1, WRITE: 2 } },
    ErrnoError: null,
    genericErrors: {},
    handleFSError: function (e) {
        if (!(e instanceof FS.ErrnoError)) throw e + " : " + stackTrace();
        return ___setErrNo(e.errno);
    },
    lookupPath: function (path, opts) {
        path = PATH.resolve(FS.cwd(), path);
        opts = opts || {};
        if (!path) return { path: "", node: null };
        var defaults = { follow_mount: true, recurse_count: 0 };
        for (var key in defaults) {
            if (opts[key] === undefined) {
                opts[key] = defaults[key];
            }
        }
        if (opts.recurse_count > 8) {
            throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
        }
        var parts = PATH.normalizeArray(
            path.split("/").filter(function (p) {
                return !!p;
            }),
            false
        );
        var current = FS.root;
        var current_path = "/";
        for (var i = 0; i < parts.length; i++) {
            var islast = i === parts.length - 1;
            if (islast && opts.parent) {
                break;
            }
            current = FS.lookupNode(current, parts[i]);
            current_path = PATH.join2(current_path, parts[i]);
            if (FS.isMountpoint(current)) {
                if (!islast || (islast && opts.follow_mount)) {
                    current = current.mounted.root;
                }
            }
            if (!islast || opts.follow) {
                var count = 0;
                while (FS.isLink(current.mode)) {
                    var link = FS.readlink(current_path);
                    current_path = PATH.resolve(PATH.dirname(current_path), link);
                    var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
                    current = lookup.node;
                    if (count++ > 40) {
                        throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
                    }
                }
            }
        }
        return { path: current_path, node: current };
    },
    getPath: function (node) {
        var path;
        while (true) {
            if (FS.isRoot(node)) {
                var mount = node.mount.mountpoint;
                if (!path) return mount;
                return mount[mount.length - 1] !== "/" ? mount + "/" + path : mount + path;
            }
            path = path ? node.name + "/" + path : node.name;
            node = node.parent;
        }
    },
    hashName: function (parentid, name) {
        var hash = 0;
        for (var i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
    },
    hashAddNode: function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
    },
    hashRemoveNode: function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
            FS.nameTable[hash] = node.name_next;
        } else {
            var current = FS.nameTable[hash];
            while (current) {
                if (current.name_next === node) {
                    current.name_next = node.name_next;
                    break;
                }
                current = current.name_next;
            }
        }
    },
    lookupNode: function (parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
            throw new FS.ErrnoError(err, parent);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
            var nodeName = node.name;
            if (node.parent.id === parent.id && nodeName === name) {
                return node;
            }
        }
        return FS.lookup(parent, name);
    },
    createNode: function (parent, name, mode, rdev) {
        if (!FS.FSNode) {
            FS.FSNode = function (parent, name, mode, rdev) {
                if (!parent) {
                    parent = this;
                }
                this.parent = parent;
                this.mount = parent.mount;
                this.mounted = null;
                this.id = FS.nextInode++;
                this.name = name;
                this.mode = mode;
                this.node_ops = {};
                this.stream_ops = {};
                this.rdev = rdev;
            };
            FS.FSNode.prototype = {};
            var readMode = 292 | 73;
            var writeMode = 146;
            Object.defineProperties(FS.FSNode.prototype, {
                read: {
                    get: function () {
                        return (this.mode & readMode) === readMode;
                    },
                    set: function (val) {
                        val ? (this.mode |= readMode) : (this.mode &= ~readMode);
                    },
                },
                write: {
                    get: function () {
                        return (this.mode & writeMode) === writeMode;
                    },
                    set: function (val) {
                        val ? (this.mode |= writeMode) : (this.mode &= ~writeMode);
                    },
                },
                isFolder: {
                    get: function () {
                        return FS.isDir(this.mode);
                    },
                },
                isDevice: {
                    get: function () {
                        return FS.isChrdev(this.mode);
                    },
                },
            });
        }
        var node = new FS.FSNode(parent, name, mode, rdev);
        FS.hashAddNode(node);
        return node;
    },
    destroyNode: function (node) {
        FS.hashRemoveNode(node);
    },
    isRoot: function (node) {
        return node === node.parent;
    },
    isMountpoint: function (node) {
        return !!node.mounted;
    },
    isFile: function (mode) {
        return (mode & 61440) === 32768;
    },
    isDir: function (mode) {
        return (mode & 61440) === 16384;
    },
    isLink: function (mode) {
        return (mode & 61440) === 40960;
    },
    isChrdev: function (mode) {
        return (mode & 61440) === 8192;
    },
    isBlkdev: function (mode) {
        return (mode & 61440) === 24576;
    },
    isFIFO: function (mode) {
        return (mode & 61440) === 4096;
    },
    isSocket: function (mode) {
        return (mode & 49152) === 49152;
    },
    flagModes: { r: 0, rs: 1052672, "r+": 2, w: 577, wx: 705, xw: 705, "w+": 578, "wx+": 706, "xw+": 706, a: 1089, ax: 1217, xa: 1217, "a+": 1090, "ax+": 1218, "xa+": 1218 },
    modeStringToFlags: function (str) {
        var flags = FS.flagModes[str];
        if (typeof flags === "undefined") {
            throw new Error("Unknown file open mode: " + str);
        }
        return flags;
    },
    flagsToPermissionString: function (flag) {
        var accmode = flag & 2097155;
        var perms = ["r", "w", "rw"][accmode];
        if (flag & 512) {
            perms += "w";
        }
        return perms;
    },
    nodePermissions: function (node, perms) {
        if (FS.ignorePermissions) {
            return 0;
        }
        if (perms.indexOf("r") !== -1 && !(node.mode & 292)) {
            return ERRNO_CODES.EACCES;
        } else if (perms.indexOf("w") !== -1 && !(node.mode & 146)) {
            return ERRNO_CODES.EACCES;
        } else if (perms.indexOf("x") !== -1 && !(node.mode & 73)) {
            return ERRNO_CODES.EACCES;
        }
        return 0;
    },
    mayLookup: function (dir) {
        var err = FS.nodePermissions(dir, "x");
        if (err) return err;
        if (!dir.node_ops.lookup) return ERRNO_CODES.EACCES;
        return 0;
    },
    mayCreate: function (dir, name) {
        try {
            var node = FS.lookupNode(dir, name);
            return ERRNO_CODES.EEXIST;
        } catch (e) {}
        return FS.nodePermissions(dir, "wx");
    },
    mayDelete: function (dir, name, isdir) {
        var node;
        try {
            node = FS.lookupNode(dir, name);
        } catch (e) {
            return e.errno;
        }
        var err = FS.nodePermissions(dir, "wx");
        if (err) {
            return err;
        }
        if (isdir) {
            if (!FS.isDir(node.mode)) {
                return ERRNO_CODES.ENOTDIR;
            }
            if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
                return ERRNO_CODES.EBUSY;
            }
        } else {
            if (FS.isDir(node.mode)) {
                return ERRNO_CODES.EISDIR;
            }
        }
        return 0;
    },
    mayOpen: function (node, flags) {
        if (!node) {
            return ERRNO_CODES.ENOENT;
        }
        if (FS.isLink(node.mode)) {
            return ERRNO_CODES.ELOOP;
        } else if (FS.isDir(node.mode)) {
            if ((flags & 2097155) !== 0 || flags & 512) {
                return ERRNO_CODES.EISDIR;
            }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
    },
    MAX_OPEN_FDS: 4096,
    nextfd: function (fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
            if (!FS.streams[fd]) {
                return fd;
            }
        }
        throw new FS.ErrnoError(ERRNO_CODES.EMFILE);
    },
    getStream: function (fd) {
        return FS.streams[fd];
    },
    createStream: function (stream, fd_start, fd_end) {
        if (!FS.FSStream) {
            FS.FSStream = function () {};
            FS.FSStream.prototype = {};
            Object.defineProperties(FS.FSStream.prototype, {
                object: {
                    get: function () {
                        return this.node;
                    },
                    set: function (val) {
                        this.node = val;
                    },
                },
                isRead: {
                    get: function () {
                        return (this.flags & 2097155) !== 1;
                    },
                },
                isWrite: {
                    get: function () {
                        return (this.flags & 2097155) !== 0;
                    },
                },
                isAppend: {
                    get: function () {
                        return this.flags & 1024;
                    },
                },
            });
        }
        var newStream = new FS.FSStream();
        for (var p in stream) {
            newStream[p] = stream[p];
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
    },
    closeStream: function (fd) {
        FS.streams[fd] = null;
    },
    getStreamFromPtr: function (ptr) {
        return FS.streams[ptr - 1];
    },
    getPtrForStream: function (stream) {
        return stream ? stream.fd + 1 : 0;
    },
    chrdev_stream_ops: {
        open: function (stream) {
            var device = FS.getDevice(stream.node.rdev);
            stream.stream_ops = device.stream_ops;
            if (stream.stream_ops.open) {
                stream.stream_ops.open(stream);
            }
        },
        llseek: function () {
            throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        },
    },
    major: function (dev) {
        return dev >> 8;
    },
    minor: function (dev) {
        return dev & 255;
    },
    makedev: function (ma, mi) {
        return (ma << 8) | mi;
    },
    registerDevice: function (dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
    },
    getDevice: function (dev) {
        return FS.devices[dev];
    },
    getMounts: function (mount) {
        var mounts = [];
        var check = [mount];
        while (check.length) {
            var m = check.pop();
            mounts.push(m);
            check.push.apply(check, m.mounts);
        }
        return mounts;
    },
    syncfs: function (populate, callback) {
        if (typeof populate === "function") {
            callback = populate;
            populate = false;
        }
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
        function done(err) {
            if (err) {
                if (!done.errored) {
                    done.errored = true;
                    return callback(err);
                }
                return;
            }
            if (++completed >= mounts.length) {
                callback(null);
            }
        }
        mounts.forEach(function (mount) {
            if (!mount.type.syncfs) {
                return done(null);
            }
            mount.type.syncfs(mount, populate, done);
        });
    },
    mount: function (type, opts, mountpoint) {
        var root = mountpoint === "/";
        var pseudo = !mountpoint;
        var node;
        if (root && FS.root) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        } else if (!root && !pseudo) {
            var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
            mountpoint = lookup.path;
            node = lookup.node;
            if (FS.isMountpoint(node)) {
                throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
            }
            if (!FS.isDir(node.mode)) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
            }
        }
        var mount = { type: type, opts: opts, mountpoint: mountpoint, mounts: [] };
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
        if (root) {
            FS.root = mountRoot;
        } else if (node) {
            node.mounted = mount;
            if (node.mount) {
                node.mount.mounts.push(mount);
            }
        }
        return mountRoot;
    },
    unmount: function (mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
        if (!FS.isMountpoint(lookup.node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
        Object.keys(FS.nameTable).forEach(function (hash) {
            var current = FS.nameTable[hash];
            while (current) {
                var next = current.name_next;
                if (mounts.indexOf(current.mount) !== -1) {
                    FS.destroyNode(current);
                }
                current = next;
            }
        });
        node.mounted = null;
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
    },
    lookup: function (parent, name) {
        return parent.node_ops.lookup(parent, name);
    },
    mknod: function (path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === "." || name === "..") {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.mknod) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
    },
    create: function (path, mode) {
        mode = mode !== undefined ? mode : 438;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
    },
    mkdir: function (path, mode) {
        mode = mode !== undefined ? mode : 511;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
    },
    mkdev: function (path, mode, dev) {
        if (typeof dev === "undefined") {
            dev = mode;
            mode = 438;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
    },
    symlink: function (oldpath, newpath) {
        if (!PATH.resolve(oldpath)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.symlink) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
    },
    rename: function (old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        var lookup, old_dir, new_dir;
        try {
            lookup = FS.lookupPath(old_path, { parent: true });
            old_dir = lookup.node;
            lookup = FS.lookupPath(new_path, { parent: true });
            new_dir = lookup.node;
        } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        if (!old_dir || !new_dir) throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        if (old_dir.mount !== new_dir.mount) {
            throw new FS.ErrnoError(ERRNO_CODES.EXDEV);
        }
        var old_node = FS.lookupNode(old_dir, old_name);
        var relative = PATH.relative(old_path, new_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        relative = PATH.relative(new_path, old_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
        }
        var new_node;
        try {
            new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {}
        if (old_node === new_node) {
            return;
        }
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        err = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        if (!old_dir.node_ops.rename) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        if (new_dir !== old_dir) {
            err = FS.nodePermissions(old_dir, "w");
            if (err) {
                throw new FS.ErrnoError(err);
            }
        }
        try {
            if (FS.trackingDelegate["willMovePath"]) {
                FS.trackingDelegate["willMovePath"](old_path, new_path);
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willMovePath']('" + old_path + "', '" + new_path + "') threw an exception: " + e.message);
        }
        FS.hashRemoveNode(old_node);
        try {
            old_dir.node_ops.rename(old_node, new_dir, new_name);
        } catch (e) {
            throw e;
        } finally {
            FS.hashAddNode(old_node);
        }
        try {
            if (FS.trackingDelegate["onMovePath"]) FS.trackingDelegate["onMovePath"](old_path, new_path);
        } catch (e) {
            console.log("FS.trackingDelegate['onMovePath']('" + old_path + "', '" + new_path + "') threw an exception: " + e.message);
        }
    },
    rmdir: function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.rmdir) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
            if (FS.trackingDelegate["willDeletePath"]) {
                FS.trackingDelegate["willDeletePath"](path);
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
            if (FS.trackingDelegate["onDeletePath"]) FS.trackingDelegate["onDeletePath"](path);
        } catch (e) {
            console.log("FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message);
        }
    },
    readdir: function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        return node.node_ops.readdir(node);
    },
    unlink: function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
            if (err === ERRNO_CODES.EISDIR) err = ERRNO_CODES.EPERM;
            throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.unlink) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
            if (FS.trackingDelegate["willDeletePath"]) {
                FS.trackingDelegate["willDeletePath"](path);
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
            if (FS.trackingDelegate["onDeletePath"]) FS.trackingDelegate["onDeletePath"](path);
        } catch (e) {
            console.log("FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message);
        }
    },
    readlink: function (path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!link.node_ops.readlink) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return link.node_ops.readlink(link);
    },
    stat: function (path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!node.node_ops.getattr) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return node.node_ops.getattr(node);
    },
    lstat: function (path) {
        return FS.stat(path, true);
    },
    chmod: function (path, mode, dontFollow) {
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, { follow: !dontFollow });
            node = lookup.node;
        } else {
            node = path;
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, { mode: (mode & 4095) | (node.mode & ~4095), timestamp: Date.now() });
    },
    lchmod: function (path, mode) {
        FS.chmod(path, mode, true);
    },
    fchmod: function (fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chmod(stream.node, mode);
    },
    chown: function (path, uid, gid, dontFollow) {
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, { follow: !dontFollow });
            node = lookup.node;
        } else {
            node = path;
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, { timestamp: Date.now() });
    },
    lchown: function (path, uid, gid) {
        FS.chown(path, uid, gid, true);
    },
    fchown: function (fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chown(stream.node, uid, gid);
    },
    truncate: function (path, len) {
        if (len < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, { follow: true });
            node = lookup.node;
        } else {
            node = path;
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isDir(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!FS.isFile(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.nodePermissions(node, "w");
        if (err) {
            throw new FS.ErrnoError(err);
        }
        node.node_ops.setattr(node, { size: len, timestamp: Date.now() });
    },
    ftruncate: function (fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        FS.truncate(stream.node, len);
    },
    utime: function (path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, { timestamp: Math.max(atime, mtime) });
    },
    open: function (path, flags, mode, fd_start, fd_end) {
        if (path === "") {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        flags = typeof flags === "string" ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === "undefined" ? 438 : mode;
        if (flags & 64) {
            mode = (mode & 4095) | 32768;
        } else {
            mode = 0;
        }
        var node;
        if (typeof path === "object") {
            node = path;
        } else {
            path = PATH.normalize(path);
            try {
                var lookup = FS.lookupPath(path, { follow: !(flags & 131072) });
                node = lookup.node;
            } catch (e) {}
        }
        var created = false;
        if (flags & 64) {
            if (node) {
                if (flags & 128) {
                    throw new FS.ErrnoError(ERRNO_CODES.EEXIST);
                }
            } else {
                node = FS.mknod(path, mode, 0);
                created = true;
            }
        }
        if (!node) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (FS.isChrdev(node.mode)) {
            flags &= ~512;
        }
        if (!created) {
            var err = FS.mayOpen(node, flags);
            if (err) {
                throw new FS.ErrnoError(err);
            }
        }
        if (flags & 512) {
            FS.truncate(node, 0);
        }
        flags &= ~(128 | 512);
        var stream = FS.createStream({ node: node, path: FS.getPath(node), flags: flags, seekable: true, position: 0, stream_ops: node.stream_ops, ungotten: [], error: false }, fd_start, fd_end);
        if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
        }
        if (Module["logReadFiles"] && !(flags & 1)) {
            if (!FS.readFiles) FS.readFiles = {};
            if (!(path in FS.readFiles)) {
                FS.readFiles[path] = 1;
                Module["printErr"]("read file: " + path);
            }
        }
        try {
            if (FS.trackingDelegate["onOpenFile"]) {
                var trackingFlags = 0;
                if ((flags & 2097155) !== 1) {
                    trackingFlags |= FS.tracking.openFlags.READ;
                }
                if ((flags & 2097155) !== 0) {
                    trackingFlags |= FS.tracking.openFlags.WRITE;
                }
                FS.trackingDelegate["onOpenFile"](path, trackingFlags);
            }
        } catch (e) {
            console.log("FS.trackingDelegate['onOpenFile']('" + path + "', flags) threw an exception: " + e.message);
        }
        return stream;
    },
    close: function (stream) {
        try {
            if (stream.stream_ops.close) {
                stream.stream_ops.close(stream);
            }
        } catch (e) {
            throw e;
        } finally {
            FS.closeStream(stream.fd);
        }
    },
    llseek: function (stream, offset, whence) {
        if (!stream.seekable || !stream.stream_ops.llseek) {
            throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
    },
    read: function (stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.read) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var seeking = true;
        if (typeof position === "undefined") {
            position = stream.position;
            seeking = false;
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
    },
    write: function (stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.write) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if (stream.flags & 1024) {
            FS.llseek(stream, 0, 2);
        }
        var seeking = true;
        if (typeof position === "undefined") {
            position = stream.position;
            seeking = false;
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        try {
            if (stream.path && FS.trackingDelegate["onWriteToFile"]) FS.trackingDelegate["onWriteToFile"](stream.path);
        } catch (e) {
            console.log("FS.trackingDelegate['onWriteToFile']('" + path + "') threw an exception: " + e.message);
        }
        return bytesWritten;
    },
    allocate: function (stream, offset, length) {
        if (offset < 0 || length <= 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        if (!stream.stream_ops.allocate) {
            throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
        }
        stream.stream_ops.allocate(stream, offset, length);
    },
    mmap: function (stream, buffer, offset, length, position, prot, flags) {
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(ERRNO_CODES.EACCES);
        }
        if (!stream.stream_ops.mmap) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
    },
    ioctl: function (stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTTY);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
    },
    readFile: function (path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || "r";
        opts.encoding = opts.encoding || "binary";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
            throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === "utf8") {
            ret = "";
            var utf8 = new Runtime.UTF8Processor();
            for (var i = 0; i < length; i++) {
                ret += utf8.processCChar(buf[i]);
            }
        } else if (opts.encoding === "binary") {
            ret = buf;
        }
        FS.close(stream);
        return ret;
    },
    writeFile: function (path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || "w";
        opts.encoding = opts.encoding || "utf8";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
            throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var stream = FS.open(path, opts.flags, opts.mode);
        if (opts.encoding === "utf8") {
            var utf8 = new Runtime.UTF8Processor();
            var buf = new Uint8Array(utf8.processJSString(data));
            FS.write(stream, buf, 0, buf.length, 0, opts.canOwn);
        } else if (opts.encoding === "binary") {
            FS.write(stream, data, 0, data.length, 0, opts.canOwn);
        }
        FS.close(stream);
    },
    cwd: function () {
        return FS.currentPath;
    },
    chdir: function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (!FS.isDir(lookup.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        var err = FS.nodePermissions(lookup.node, "x");
        if (err) {
            throw new FS.ErrnoError(err);
        }
        FS.currentPath = lookup.path;
    },
    createDefaultDirectories: function () {
        FS.mkdir("/tmp");
        FS.mkdir("/home");
        FS.mkdir("/home/web_user");
    },
    createDefaultDevices: function () {
        FS.mkdir("/dev");
        FS.registerDevice(FS.makedev(1, 3), {
            read: function () {
                return 0;
            },
            write: function () {
                return 0;
            },
        });
        FS.mkdev("/dev/null", FS.makedev(1, 3));
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev("/dev/tty", FS.makedev(5, 0));
        FS.mkdev("/dev/tty1", FS.makedev(6, 0));
        var random_device;
        if (typeof crypto !== "undefined") {
            var randomBuffer = new Uint8Array(1);
            random_device = function () {
                crypto.getRandomValues(randomBuffer);
                return randomBuffer[0];
            };
        } else if (ENVIRONMENT_IS_NODE) {
            random_device = function () {
                return require("crypto").randomBytes(1)[0];
            };
        } else {
            random_device = function () {
                return (Math.random() * 256) | 0;
            };
        }
        FS.createDevice("/dev", "random", random_device);
        FS.createDevice("/dev", "urandom", random_device);
        FS.mkdir("/dev/shm");
        FS.mkdir("/dev/shm/tmp");
    },
    createStandardStreams: function () {
        if (Module["stdin"]) {
            FS.createDevice("/dev", "stdin", Module["stdin"]);
        } else {
            FS.symlink("/dev/tty", "/dev/stdin");
        }
        if (Module["stdout"]) {
            FS.createDevice("/dev", "stdout", null, Module["stdout"]);
        } else {
            FS.symlink("/dev/tty", "/dev/stdout");
        }
        if (Module["stderr"]) {
            FS.createDevice("/dev", "stderr", null, Module["stderr"]);
        } else {
            FS.symlink("/dev/tty1", "/dev/stderr");
        }
        var stdin = FS.open("/dev/stdin", "r");
        HEAP32[_stdin >> 2] = FS.getPtrForStream(stdin);
        assert(stdin.fd === 0, "invalid handle for stdin (" + stdin.fd + ")");
        var stdout = FS.open("/dev/stdout", "w");
        HEAP32[_stdout >> 2] = FS.getPtrForStream(stdout);
        assert(stdout.fd === 1, "invalid handle for stdout (" + stdout.fd + ")");
        var stderr = FS.open("/dev/stderr", "w");
        HEAP32[_stderr >> 2] = FS.getPtrForStream(stderr);
        assert(stderr.fd === 2, "invalid handle for stderr (" + stderr.fd + ")");
    },
    ensureErrnoError: function () {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
            this.node = node;
            this.setErrno = function (errno) {
                this.errno = errno;
                for (var key in ERRNO_CODES) {
                    if (ERRNO_CODES[key] === errno) {
                        this.code = key;
                        break;
                    }
                }
            };
            this.setErrno(errno);
            this.message = ERRNO_MESSAGES[errno];
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        [ERRNO_CODES.ENOENT].forEach(function (code) {
            FS.genericErrors[code] = new FS.ErrnoError(code);
            FS.genericErrors[code].stack = "<generic error, no stack>";
        });
    },
    staticInit: function () {
        FS.ensureErrnoError();
        FS.nameTable = new Array(4096);
        FS.mount(MEMFS, {}, "/");
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
    },
    init: function (input, output, error) {
        assert(!FS.init.initialized, "FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)");
        FS.init.initialized = true;
        FS.ensureErrnoError();
        Module["stdin"] = input || Module["stdin"];
        Module["stdout"] = output || Module["stdout"];
        Module["stderr"] = error || Module["stderr"];
        FS.createStandardStreams();
    },
    quit: function () {
        FS.init.initialized = false;
        for (var i = 0; i < FS.streams.length; i++) {
            var stream = FS.streams[i];
            if (!stream) {
                continue;
            }
            FS.close(stream);
        }
    },
    getMode: function (canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode;
    },
    joinPath: function (parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == "/") path = path.substr(1);
        return path;
    },
    absolutePath: function (relative, base) {
        return PATH.resolve(base, relative);
    },
    standardizePath: function (path) {
        return PATH.normalize(path);
    },
    findObject: function (path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
            return ret.object;
        } else {
            ___setErrNo(ret.error);
            return null;
        }
    },
    analyzePath: function (path, dontResolveLastLink) {
        try {
            var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
            path = lookup.path;
        } catch (e) {}
        var ret = { isRoot: false, exists: false, error: 0, name: null, path: null, object: null, parentExists: false, parentPath: null, parentObject: null };
        try {
            var lookup = FS.lookupPath(path, { parent: true });
            ret.parentExists = true;
            ret.parentPath = lookup.path;
            ret.parentObject = lookup.node;
            ret.name = PATH.basename(path);
            lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
            ret.exists = true;
            ret.path = lookup.path;
            ret.object = lookup.node;
            ret.name = lookup.node.name;
            ret.isRoot = lookup.path === "/";
        } catch (e) {
            ret.error = e.errno;
        }
        return ret;
    },
    createFolder: function (parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode);
    },
    createPath: function (parent, path, canRead, canWrite) {
        parent = typeof parent === "string" ? parent : FS.getPath(parent);
        var parts = path.split("/").reverse();
        while (parts.length) {
            var part = parts.pop();
            if (!part) continue;
            var current = PATH.join2(parent, part);
            try {
                FS.mkdir(current);
            } catch (e) {}
            parent = current;
        }
        return current;
    },
    createFile: function (parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode);
    },
    createDataFile: function (parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
            if (typeof data === "string") {
                var arr = new Array(data.length);
                for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
                data = arr;
            }
            FS.chmod(node, mode | 146);
            var stream = FS.open(node, "w");
            FS.write(stream, data, 0, data.length, 0, canOwn);
            FS.close(stream);
            FS.chmod(node, mode);
        }
        return node;
    },
    createDevice: function (parent, name, input, output) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        FS.registerDevice(dev, {
            open: function (stream) {
                stream.seekable = false;
            },
            close: function (stream) {
                if (output && output.buffer && output.buffer.length) {
                    output(10);
                }
            },
            read: function (stream, buffer, offset, length, pos) {
                var bytesRead = 0;
                for (var i = 0; i < length; i++) {
                    var result;
                    try {
                        result = input();
                    } catch (e) {
                        throw new FS.ErrnoError(ERRNO_CODES.EIO);
                    }
                    if (result === undefined && bytesRead === 0) {
                        throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
                    }
                    if (result === null || result === undefined) break;
                    bytesRead++;
                    buffer[offset + i] = result;
                }
                if (bytesRead) {
                    stream.node.timestamp = Date.now();
                }
                return bytesRead;
            },
            write: function (stream, buffer, offset, length, pos) {
                for (var i = 0; i < length; i++) {
                    try {
                        output(buffer[offset + i]);
                    } catch (e) {
                        throw new FS.ErrnoError(ERRNO_CODES.EIO);
                    }
                }
                if (length) {
                    stream.node.timestamp = Date.now();
                }
                return i;
            },
        });
        return FS.mkdev(path, mode, dev);
    },
    createLink: function (parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path);
    },
    forceLoadFile: function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== "undefined") {
            throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else if (Module["read"]) {
            try {
                obj.contents = intArrayFromString(Module["read"](obj.url), true);
                obj.usedBytes = obj.contents.length;
            } catch (e) {
                success = false;
            }
        } else {
            throw new Error("Cannot load without read() or XMLHttpRequest.");
        }
        if (!success) ___setErrNo(ERRNO_CODES.EIO);
        return success;
    },
    createLazyFile: function (parent, name, url, canRead, canWrite) {
        function LazyUint8Array() {
            this.lengthKnown = false;
            this.chunks = [];
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
            if (idx > this.length - 1 || idx < 0) {
                return undefined;
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = (idx / this.chunkSize) | 0;
            return this.getter(chunkNum)[chunkOffset];
        };
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
            this.getter = getter;
        };
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
            var xhr = new XMLHttpRequest();
            xhr.open("HEAD", url, false);
            xhr.send(null);
            if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            var datalength = Number(xhr.getResponseHeader("Content-length"));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
            var chunkSize = 1024 * 1024;
            if (!hasByteServing) chunkSize = datalength;
            var doXHR = function (from, to) {
                if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
                if (to > datalength - 1) throw new Error("only " + datalength + " bytes available! programmer error!");
                var xhr = new XMLHttpRequest();
                xhr.open("GET", url, false);
                if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
                if (typeof Uint8Array != "undefined") xhr.responseType = "arraybuffer";
                if (xhr.overrideMimeType) {
                    xhr.overrideMimeType("text/plain; charset=x-user-defined");
                }
                xhr.send(null);
                if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
                if (xhr.response !== undefined) {
                    return new Uint8Array(xhr.response || []);
                } else {
                    return intArrayFromString(xhr.responseText || "", true);
                }
            };
            var lazyArray = this;
            lazyArray.setDataGetter(function (chunkNum) {
                var start = chunkNum * chunkSize;
                var end = (chunkNum + 1) * chunkSize - 1;
                end = Math.min(end, datalength - 1);
                if (typeof lazyArray.chunks[chunkNum] === "undefined") {
                    lazyArray.chunks[chunkNum] = doXHR(start, end);
                }
                if (typeof lazyArray.chunks[chunkNum] === "undefined") throw new Error("doXHR failed!");
                return lazyArray.chunks[chunkNum];
            });
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true;
        };
        if (typeof XMLHttpRequest !== "undefined") {
            if (!ENVIRONMENT_IS_WORKER) throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
            var lazyArray = new LazyUint8Array();
            Object.defineProperty(lazyArray, "length", {
                get: function () {
                    if (!this.lengthKnown) {
                        this.cacheLength();
                    }
                    return this._length;
                },
            });
            Object.defineProperty(lazyArray, "chunkSize", {
                get: function () {
                    if (!this.lengthKnown) {
                        this.cacheLength();
                    }
                    return this._chunkSize;
                },
            });
            var properties = { isDevice: false, contents: lazyArray };
        } else {
            var properties = { isDevice: false, url: url };
        }
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        if (properties.contents) {
            node.contents = properties.contents;
        } else if (properties.url) {
            node.contents = null;
            node.url = properties.url;
        }
        Object.defineProperty(node, "usedBytes", {
            get: function () {
                return this.contents.length;
            },
        });
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function (key) {
            var fn = node.stream_ops[key];
            stream_ops[key] = function forceLoadLazyFile() {
                if (!FS.forceLoadFile(node)) {
                    throw new FS.ErrnoError(ERRNO_CODES.EIO);
                }
                return fn.apply(null, arguments);
            };
        });
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
            if (!FS.forceLoadFile(node)) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            var contents = stream.node.contents;
            if (position >= contents.length) return 0;
            var size = Math.min(contents.length - position, length);
            assert(size >= 0);
            if (contents.slice) {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents[position + i];
                }
            } else {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents.get(position + i);
                }
            }
            return size;
        };
        node.stream_ops = stream_ops;
        return node;
    },
    createPreloadedFile: function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn) {
        Browser.init();
        var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
        function processData(byteArray) {
            function finish(byteArray) {
                if (!dontCreateFile) {
                    FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
                }
                if (onload) onload();
                removeRunDependency("cp " + fullname);
            }
            var handled = false;
            Module["preloadPlugins"].forEach(function (plugin) {
                if (handled) return;
                if (plugin["canHandle"](fullname)) {
                    plugin["handle"](byteArray, fullname, finish, function () {
                        if (onerror) onerror();
                        removeRunDependency("cp " + fullname);
                    });
                    handled = true;
                }
            });
            if (!handled) finish(byteArray);
        }
        addRunDependency("cp " + fullname);
        if (typeof url == "string") {
            Browser.asyncLoad(
                url,
                function (byteArray) {
                    processData(byteArray);
                },
                onerror
            );
        } else {
            processData(url);
        }
    },
    indexedDB: function () {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    },
    DB_NAME: function () {
        return "EM_FS_" + window.location.pathname;
    },
    DB_VERSION: 20,
    DB_STORE_NAME: "FILE_DATA",
    saveFilesToDB: function (paths, onload, onerror) {
        onload = onload || function () {};
        onerror = onerror || function () {};
        var indexedDB = FS.indexedDB();
        try {
            var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
            return onerror(e);
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
            console.log("creating db");
            var db = openRequest.result;
            db.createObjectStore(FS.DB_STORE_NAME);
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
            var db = openRequest.result;
            var transaction = db.transaction([FS.DB_STORE_NAME], "readwrite");
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0,
                fail = 0,
                total = paths.length;
            function finish() {
                if (fail == 0) onload();
                else onerror();
            }
            paths.forEach(function (path) {
                var putRequest = files.put(FS.analyzePath(path).object.contents, path);
                putRequest.onsuccess = function putRequest_onsuccess() {
                    ok++;
                    if (ok + fail == total) finish();
                };
                putRequest.onerror = function putRequest_onerror() {
                    fail++;
                    if (ok + fail == total) finish();
                };
            });
            transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
    },
    loadFilesFromDB: function (paths, onload, onerror) {
        onload = onload || function () {};
        onerror = onerror || function () {};
        var indexedDB = FS.indexedDB();
        try {
            var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
            return onerror(e);
        }
        openRequest.onupgradeneeded = onerror;
        openRequest.onsuccess = function openRequest_onsuccess() {
            var db = openRequest.result;
            try {
                var transaction = db.transaction([FS.DB_STORE_NAME], "readonly");
            } catch (e) {
                onerror(e);
                return;
            }
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0,
                fail = 0,
                total = paths.length;
            function finish() {
                if (fail == 0) onload();
                else onerror();
            }
            paths.forEach(function (path) {
                var getRequest = files.get(path);
                getRequest.onsuccess = function getRequest_onsuccess() {
                    if (FS.analyzePath(path).exists) {
                        FS.unlink(path);
                    }
                    FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
                    ok++;
                    if (ok + fail == total) finish();
                };
                getRequest.onerror = function getRequest_onerror() {
                    fail++;
                    if (ok + fail == total) finish();
                };
            });
            transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
    },
};
function _close(fildes) {
    var stream = FS.getStream(fildes);
    if (!stream) {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
    }
    try {
        FS.close(stream);
        return 0;
    } catch (e) {
        FS.handleFSError(e);
        return -1;
    }
}
function _fsync(fildes) {
    var stream = FS.getStream(fildes);
    if (stream) {
        return 0;
    } else {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
    }
}
function _fileno(stream) {
    stream = FS.getStreamFromPtr(stream);
    if (!stream) return -1;
    return stream.fd;
}
function _fclose(stream) {
    var fd = _fileno(stream);
    _fsync(fd);
    return _close(fd);
}
function _emscripten_glGetString(name_) {
    if (GL.stringCache[name_]) return GL.stringCache[name_];
    var ret;
    switch (name_) {
        case 7936:
        case 7937:
        case 7938:
            ret = allocate(intArrayFromString(GLctx.getParameter(name_)), "i8", ALLOC_NORMAL);
            break;
        case 7939:
            var exts = GLctx.getSupportedExtensions();
            var gl_exts = [];
            for (i in exts) {
                gl_exts.push(exts[i]);
                gl_exts.push("GL_" + exts[i]);
            }
            ret = allocate(intArrayFromString(gl_exts.join(" ")), "i8", ALLOC_NORMAL);
            break;
        case 35724:
            ret = allocate(intArrayFromString("OpenGL ES GLSL 1.00 (WebGL)"), "i8", ALLOC_NORMAL);
            break;
        default:
            GL.recordError(1280);
            return 0;
    }
    GL.stringCache[name_] = ret;
    return ret;
}
function _free() {}
Module["_free"] = _free;
function _malloc(bytes) {
    var ptr = Runtime.dynamicAlloc(bytes + 8);
    return (ptr + 8) & 4294967288;
}
Module["_malloc"] = _malloc;
function embind_init_charCodes() {
    var codes = new Array(256);
    for (var i = 0; i < 256; ++i) {
        codes[i] = String.fromCharCode(i);
    }
    embind_charCodes = codes;
}
var embind_charCodes = undefined;
function readLatin1String(ptr) {
    var ret = "";
    var c = ptr;
    while (HEAPU8[c]) {
        ret += embind_charCodes[HEAPU8[c++]];
    }
    return ret;
}
var awaitingDependencies = {};
var registeredTypes = {};
var typeDependencies = {};
var char_0 = 48;
var char_9 = 57;
function makeLegalFunctionName(name) {
    if (undefined === name) {
        return "_unknown";
    }
    name = name.replace(/[^a-zA-Z0-9_]/g, "$");
    var f = name.charCodeAt(0);
    if (f >= char_0 && f <= char_9) {
        return "_" + name;
    } else {
        return name;
    }
}
function createNamedFunction(name, body) {
    name = makeLegalFunctionName(name);
    return new Function("body", "return function " + name + "() {\n" + '    "use strict";' + "    return body.apply(this, arguments);\n" + "};\n")(body);
}
function extendError(baseErrorType, errorName) {
    var errorClass = createNamedFunction(errorName, function (message) {
        this.name = errorName;
        this.message = message;
        var stack = new Error(message).stack;
        if (stack !== undefined) {
            this.stack = this.toString() + "\n" + stack.replace(/^Error(:[^\n]*)?\n/, "");
        }
    });
    errorClass.prototype = Object.create(baseErrorType.prototype);
    errorClass.prototype.constructor = errorClass;
    errorClass.prototype.toString = function () {
        if (this.message === undefined) {
            return this.name;
        } else {
            return this.name + ": " + this.message;
        }
    };
    return errorClass;
}
var BindingError = undefined;
function throwBindingError(message) {
    throw new BindingError(message);
}
var InternalError = undefined;
function throwInternalError(message) {
    throw new InternalError(message);
}
function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
    myTypes.forEach(function (type) {
        typeDependencies[type] = dependentTypes;
    });
    function onComplete(typeConverters) {
        var myTypeConverters = getTypeConverters(typeConverters);
        if (myTypeConverters.length !== myTypes.length) {
            throwInternalError("Mismatched type converter count");
        }
        for (var i = 0; i < myTypes.length; ++i) {
            registerType(myTypes[i], myTypeConverters[i]);
        }
    }
    var typeConverters = new Array(dependentTypes.length);
    var unregisteredTypes = [];
    var registered = 0;
    dependentTypes.forEach(function (dt, i) {
        if (registeredTypes.hasOwnProperty(dt)) {
            typeConverters[i] = registeredTypes[dt];
        } else {
            unregisteredTypes.push(dt);
            if (!awaitingDependencies.hasOwnProperty(dt)) {
                awaitingDependencies[dt] = [];
            }
            awaitingDependencies[dt].push(function () {
                typeConverters[i] = registeredTypes[dt];
                ++registered;
                if (registered === unregisteredTypes.length) {
                    onComplete(typeConverters);
                }
            });
        }
    });
    if (0 === unregisteredTypes.length) {
        onComplete(typeConverters);
    }
}
function registerType(rawType, registeredInstance, options) {
    options = options || {};
    if (!("argPackAdvance" in registeredInstance)) {
        throw new TypeError("registerType registeredInstance requires argPackAdvance");
    }
    var name = registeredInstance.name;
    if (!rawType) {
        throwBindingError('type "' + name + '" must have a positive integer typeid pointer');
    }
    if (registeredTypes.hasOwnProperty(rawType)) {
        if (options.ignoreDuplicateRegistrations) {
            return;
        } else {
            throwBindingError("Cannot register type '" + name + "' twice");
        }
    }
    registeredTypes[rawType] = registeredInstance;
    delete typeDependencies[rawType];
    if (awaitingDependencies.hasOwnProperty(rawType)) {
        var callbacks = awaitingDependencies[rawType];
        delete awaitingDependencies[rawType];
        callbacks.forEach(function (cb) {
            cb();
        });
    }
}
function simpleReadValueFromPointer(pointer) {
    return this["fromWireType"](HEAPU32[pointer >> 2]);
}
function __embind_register_std_string(rawType, name) {
    name = readLatin1String(name);
    registerType(rawType, {
        name: name,
        fromWireType: function (value) {
            var length = HEAPU32[value >> 2];
            var a = new Array(length);
            for (var i = 0; i < length; ++i) {
                a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
            }
            _free(value);
            return a.join("");
        },
        toWireType: function (destructors, value) {
            if (value instanceof ArrayBuffer) {
                value = new Uint8Array(value);
            }
            function getTAElement(ta, index) {
                return ta[index];
            }
            function getStringElement(string, index) {
                return string.charCodeAt(index);
            }
            var getElement;
            if (value instanceof Uint8Array) {
                getElement = getTAElement;
            } else if (value instanceof Int8Array) {
                getElement = getTAElement;
            } else if (typeof value === "string") {
                getElement = getStringElement;
            } else {
                throwBindingError("Cannot pass non-string to std::string");
            }
            var length = value.length;
            var ptr = _malloc(4 + length);
            HEAPU32[ptr >> 2] = length;
            for (var i = 0; i < length; ++i) {
                var charCode = getElement(value, i);
                if (charCode > 255) {
                    _free(ptr);
                    throwBindingError("String has UTF-16 code units that do not fit in 8 bits");
                }
                HEAPU8[ptr + 4 + i] = charCode;
            }
            if (destructors !== null) {
                destructors.push(_free, ptr);
            }
            return ptr;
        },
        argPackAdvance: 8,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction: function (ptr) {
            _free(ptr);
        },
    });
}
function __embind_register_std_wstring(rawType, charSize, name) {
    name = readLatin1String(name);
    var HEAP, shift;
    if (charSize === 2) {
        HEAP = HEAPU16;
        shift = 1;
    } else if (charSize === 4) {
        HEAP = HEAPU32;
        shift = 2;
    }
    registerType(rawType, {
        name: name,
        fromWireType: function (value) {
            var length = HEAPU32[value >> 2];
            var a = new Array(length);
            var start = (value + 4) >> shift;
            for (var i = 0; i < length; ++i) {
                a[i] = String.fromCharCode(HEAP[start + i]);
            }
            _free(value);
            return a.join("");
        },
        toWireType: function (destructors, value) {
            var length = value.length;
            var ptr = _malloc(4 + length * charSize);
            HEAPU32[ptr >> 2] = length;
            var start = (ptr + 4) >> shift;
            for (var i = 0; i < length; ++i) {
                HEAP[start + i] = value.charCodeAt(i);
            }
            if (destructors !== null) {
                destructors.push(_free, ptr);
            }
            return ptr;
        },
        argPackAdvance: 8,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction: function (ptr) {
            _free(ptr);
        },
    });
}
function _emscripten_glRotatef() {
    Module["printErr"]("missing function: emscripten_glRotatef");
    abort(-1);
}
function _emscripten_glStencilFunc(x0, x1, x2) {
    GLctx.stencilFunc(x0, x1, x2);
}
function _emscripten_glGetIntegerv(name_, p) {
    return GL.get(name_, p, "Integer");
}
function _emscripten_glGetFramebufferAttachmentParameteriv(target, attachment, pname, params) {
    var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
    HEAP32[params >> 2] = result;
}
function _mkport() {
    throw "TODO";
}
var SOCKFS = {
    mount: function (mount) {
        Module["websocket"] = Module["websocket"] && "object" === typeof Module["websocket"] ? Module["websocket"] : {};
        Module["websocket"]._callbacks = {};
        Module["websocket"]["on"] = function (event, callback) {
            if ("function" === typeof callback) {
                this._callbacks[event] = callback;
            }
            return this;
        };
        Module["websocket"].emit = function (event, param) {
            if ("function" === typeof this._callbacks[event]) {
                this._callbacks[event].call(this, param);
            }
        };
        return FS.createNode(null, "/", 16384 | 511, 0);
    },
    createSocket: function (family, type, protocol) {
        var streaming = type == 1;
        if (protocol) {
            assert(streaming == (protocol == 6));
        }
        var sock = { family: family, type: type, protocol: protocol, server: null, error: null, peers: {}, pending: [], recv_queue: [], sock_ops: SOCKFS.websocket_sock_ops };
        var name = SOCKFS.nextname();
        var node = FS.createNode(SOCKFS.root, name, 49152, 0);
        node.sock = sock;
        var stream = FS.createStream({ path: name, node: node, flags: FS.modeStringToFlags("r+"), seekable: false, stream_ops: SOCKFS.stream_ops });
        sock.stream = stream;
        return sock;
    },
    getSocket: function (fd) {
        var stream = FS.getStream(fd);
        if (!stream || !FS.isSocket(stream.node.mode)) {
            return null;
        }
        return stream.node.sock;
    },
    stream_ops: {
        poll: function (stream) {
            var sock = stream.node.sock;
            return sock.sock_ops.poll(sock);
        },
        ioctl: function (stream, request, varargs) {
            var sock = stream.node.sock;
            return sock.sock_ops.ioctl(sock, request, varargs);
        },
        read: function (stream, buffer, offset, length, position) {
            var sock = stream.node.sock;
            var msg = sock.sock_ops.recvmsg(sock, length);
            if (!msg) {
                return 0;
            }
            buffer.set(msg.buffer, offset);
            return msg.buffer.length;
        },
        write: function (stream, buffer, offset, length, position) {
            var sock = stream.node.sock;
            return sock.sock_ops.sendmsg(sock, buffer, offset, length);
        },
        close: function (stream) {
            var sock = stream.node.sock;
            sock.sock_ops.close(sock);
        },
    },
    nextname: function () {
        if (!SOCKFS.nextname.current) {
            SOCKFS.nextname.current = 0;
        }
        return "socket[" + SOCKFS.nextname.current++ + "]";
    },
    websocket_sock_ops: {
        createPeer: function (sock, addr, port) {
            var ws;
            if (typeof addr === "object") {
                ws = addr;
                addr = null;
                port = null;
            }
            if (ws) {
                if (ws._socket) {
                    addr = ws._socket.remoteAddress;
                    port = ws._socket.remotePort;
                } else {
                    var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
                    if (!result) {
                        throw new Error("WebSocket URL must be in the format ws(s)://address:port");
                    }
                    addr = result[1];
                    port = parseInt(result[2], 10);
                }
            } else {
                try {
                    var runtimeConfig = Module["websocket"] && "object" === typeof Module["websocket"];
                    var url = "ws:#".replace("#", "//");
                    if (runtimeConfig) {
                        if ("string" === typeof Module["websocket"]["url"]) {
                            url = Module["websocket"]["url"];
                        }
                    }
                    if (url === "ws://" || url === "wss://") {
                        var parts = addr.split("/");
                        url = url + parts[0] + ":" + port + "/" + parts.slice(1).join("/");
                    }
                    var subProtocols = "binary";
                    if (runtimeConfig) {
                        if ("string" === typeof Module["websocket"]["subprotocol"]) {
                            subProtocols = Module["websocket"]["subprotocol"];
                        }
                    }
                    subProtocols = subProtocols.replace(/^ +| +$/g, "").split(/ *, */);
                    var opts = ENVIRONMENT_IS_NODE ? { protocol: subProtocols.toString() } : subProtocols;
                    var WebSocket = ENVIRONMENT_IS_NODE ? require("ws") : window["WebSocket"];
                    ws = new WebSocket(url, opts);
                    ws.binaryType = "arraybuffer";
                } catch (e) {
                    throw new FS.ErrnoError(ERRNO_CODES.EHOSTUNREACH);
                }
            }
            var peer = { addr: addr, port: port, socket: ws, dgram_send_queue: [] };
            SOCKFS.websocket_sock_ops.addPeer(sock, peer);
            SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);
            if (sock.type === 2 && typeof sock.sport !== "undefined") {
                peer.dgram_send_queue.push(new Uint8Array([255, 255, 255, 255, "p".charCodeAt(0), "o".charCodeAt(0), "r".charCodeAt(0), "t".charCodeAt(0), (sock.sport & 65280) >> 8, sock.sport & 255]));
            }
            return peer;
        },
        getPeer: function (sock, addr, port) {
            return sock.peers[addr + ":" + port];
        },
        addPeer: function (sock, peer) {
            sock.peers[peer.addr + ":" + peer.port] = peer;
        },
        removePeer: function (sock, peer) {
            delete sock.peers[peer.addr + ":" + peer.port];
        },
        handlePeerEvents: function (sock, peer) {
            var first = true;
            var handleOpen = function () {
                Module["websocket"].emit("open", sock.stream.fd);
                try {
                    var queued = peer.dgram_send_queue.shift();
                    while (queued) {
                        peer.socket.send(queued);
                        queued = peer.dgram_send_queue.shift();
                    }
                } catch (e) {
                    peer.socket.close();
                }
            };
            function handleMessage(data) {
                assert(typeof data !== "string" && data.byteLength !== undefined);
                data = new Uint8Array(data);
                var wasfirst = first;
                first = false;
                if (
                    wasfirst &&
                    data.length === 10 &&
                    data[0] === 255 &&
                    data[1] === 255 &&
                    data[2] === 255 &&
                    data[3] === 255 &&
                    data[4] === "p".charCodeAt(0) &&
                    data[5] === "o".charCodeAt(0) &&
                    data[6] === "r".charCodeAt(0) &&
                    data[7] === "t".charCodeAt(0)
                ) {
                    var newport = (data[8] << 8) | data[9];
                    SOCKFS.websocket_sock_ops.removePeer(sock, peer);
                    peer.port = newport;
                    SOCKFS.websocket_sock_ops.addPeer(sock, peer);
                    return;
                }
                sock.recv_queue.push({ addr: peer.addr, port: peer.port, data: data });
                Module["websocket"].emit("message", sock.stream.fd);
            }
            if (ENVIRONMENT_IS_NODE) {
                peer.socket.on("open", handleOpen);
                peer.socket.on("message", function (data, flags) {
                    if (!flags.binary) {
                        return;
                    }
                    handleMessage(new Uint8Array(data).buffer);
                });
                peer.socket.on("close", function () {
                    Module["websocket"].emit("close", sock.stream.fd);
                });
                peer.socket.on("error", function (error) {
                    sock.error = ERRNO_CODES.ECONNREFUSED;
                    Module["websocket"].emit("error", [sock.stream.fd, sock.error, "ECONNREFUSED: Connection refused"]);
                });
            } else {
                peer.socket.onopen = handleOpen;
                peer.socket.onclose = function () {
                    Module["websocket"].emit("close", sock.stream.fd);
                };
                peer.socket.onmessage = function peer_socket_onmessage(event) {
                    handleMessage(event.data);
                };
                peer.socket.onerror = function (error) {
                    sock.error = ERRNO_CODES.ECONNREFUSED;
                    Module["websocket"].emit("error", [sock.stream.fd, sock.error, "ECONNREFUSED: Connection refused"]);
                };
            }
        },
        poll: function (sock) {
            if (sock.type === 1 && sock.server) {
                return sock.pending.length ? 64 | 1 : 0;
            }
            var mask = 0;
            var dest = sock.type === 1 ? SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport) : null;
            if (sock.recv_queue.length || !dest || (dest && dest.socket.readyState === dest.socket.CLOSING) || (dest && dest.socket.readyState === dest.socket.CLOSED)) {
                mask |= 64 | 1;
            }
            if (!dest || (dest && dest.socket.readyState === dest.socket.OPEN)) {
                mask |= 4;
            }
            if ((dest && dest.socket.readyState === dest.socket.CLOSING) || (dest && dest.socket.readyState === dest.socket.CLOSED)) {
                mask |= 16;
            }
            return mask;
        },
        ioctl: function (sock, request, arg) {
            switch (request) {
                case 21531:
                    var bytes = 0;
                    if (sock.recv_queue.length) {
                        bytes = sock.recv_queue[0].data.length;
                    }
                    HEAP32[arg >> 2] = bytes;
                    return 0;
                default:
                    return ERRNO_CODES.EINVAL;
            }
        },
        close: function (sock) {
            if (sock.server) {
                try {
                    sock.server.close();
                } catch (e) {}
                sock.server = null;
            }
            var peers = Object.keys(sock.peers);
            for (var i = 0; i < peers.length; i++) {
                var peer = sock.peers[peers[i]];
                try {
                    peer.socket.close();
                } catch (e) {}
                SOCKFS.websocket_sock_ops.removePeer(sock, peer);
            }
            return 0;
        },
        bind: function (sock, addr, port) {
            if (typeof sock.saddr !== "undefined" || typeof sock.sport !== "undefined") {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
            sock.saddr = addr;
            sock.sport = port || _mkport();
            if (sock.type === 2) {
                if (sock.server) {
                    sock.server.close();
                    sock.server = null;
                }
                try {
                    sock.sock_ops.listen(sock, 0);
                } catch (e) {
                    if (!(e instanceof FS.ErrnoError)) throw e;
                    if (e.errno !== ERRNO_CODES.EOPNOTSUPP) throw e;
                }
            }
        },
        connect: function (sock, addr, port) {
            if (sock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
            }
            if (typeof sock.daddr !== "undefined" && typeof sock.dport !== "undefined") {
                var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
                if (dest) {
                    if (dest.socket.readyState === dest.socket.CONNECTING) {
                        throw new FS.ErrnoError(ERRNO_CODES.EALREADY);
                    } else {
                        throw new FS.ErrnoError(ERRNO_CODES.EISCONN);
                    }
                }
            }
            var peer = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
            sock.daddr = peer.addr;
            sock.dport = peer.port;
            throw new FS.ErrnoError(ERRNO_CODES.EINPROGRESS);
        },
        listen: function (sock, backlog) {
            if (!ENVIRONMENT_IS_NODE) {
                throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
            }
            if (sock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
            var WebSocketServer = require("ws").Server;
            var host = sock.saddr;
            sock.server = new WebSocketServer({ host: host, port: sock.sport });
            Module["websocket"].emit("listen", sock.stream.fd);
            sock.server.on("connection", function (ws) {
                if (sock.type === 1) {
                    var newsock = SOCKFS.createSocket(sock.family, sock.type, sock.protocol);
                    var peer = SOCKFS.websocket_sock_ops.createPeer(newsock, ws);
                    newsock.daddr = peer.addr;
                    newsock.dport = peer.port;
                    sock.pending.push(newsock);
                    Module["websocket"].emit("connection", newsock.stream.fd);
                } else {
                    SOCKFS.websocket_sock_ops.createPeer(sock, ws);
                    Module["websocket"].emit("connection", sock.stream.fd);
                }
            });
            sock.server.on("closed", function () {
                Module["websocket"].emit("close", sock.stream.fd);
                sock.server = null;
            });
            sock.server.on("error", function (error) {
                sock.error = ERRNO_CODES.EHOSTUNREACH;
                Module["websocket"].emit("error", [sock.stream.fd, sock.error, "EHOSTUNREACH: Host is unreachable"]);
            });
        },
        accept: function (listensock) {
            if (!listensock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
            var newsock = listensock.pending.shift();
            newsock.stream.flags = listensock.stream.flags;
            return newsock;
        },
        getname: function (sock, peer) {
            var addr, port;
            if (peer) {
                if (sock.daddr === undefined || sock.dport === undefined) {
                    throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
                }
                addr = sock.daddr;
                port = sock.dport;
            } else {
                addr = sock.saddr || 0;
                port = sock.sport || 0;
            }
            return { addr: addr, port: port };
        },
        sendmsg: function (sock, buffer, offset, length, addr, port) {
            if (sock.type === 2) {
                if (addr === undefined || port === undefined) {
                    addr = sock.daddr;
                    port = sock.dport;
                }
                if (addr === undefined || port === undefined) {
                    throw new FS.ErrnoError(ERRNO_CODES.EDESTADDRREQ);
                }
            } else {
                addr = sock.daddr;
                port = sock.dport;
            }
            var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);
            if (sock.type === 1) {
                if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                    throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
                } else if (dest.socket.readyState === dest.socket.CONNECTING) {
                    throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
                }
            }
            var data;
            if (buffer instanceof Array || buffer instanceof ArrayBuffer) {
                data = buffer.slice(offset, offset + length);
            } else {
                data = buffer.buffer.slice(buffer.byteOffset + offset, buffer.byteOffset + offset + length);
            }
            if (sock.type === 2) {
                if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
                    if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                        dest = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
                    }
                    dest.dgram_send_queue.push(data);
                    return length;
                }
            }
            try {
                dest.socket.send(data);
                return length;
            } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
        },
        recvmsg: function (sock, length) {
            if (sock.type === 1 && sock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
            }
            var queued = sock.recv_queue.shift();
            if (!queued) {
                if (sock.type === 1) {
                    var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
                    if (!dest) {
                        throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
                    } else if (dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                        return null;
                    } else {
                        throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
                    }
                } else {
                    throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
                }
            }
            var queuedLength = queued.data.byteLength || queued.data.length;
            var queuedOffset = queued.data.byteOffset || 0;
            var queuedBuffer = queued.data.buffer || queued.data;
            var bytesRead = Math.min(length, queuedLength);
            var res = { buffer: new Uint8Array(queuedBuffer, queuedOffset, bytesRead), addr: queued.addr, port: queued.port };
            if (sock.type === 1 && bytesRead < queuedLength) {
                var bytesRemaining = queuedLength - bytesRead;
                queued.data = new Uint8Array(queuedBuffer, queuedOffset + bytesRead, bytesRemaining);
                sock.recv_queue.unshift(queued);
            }
            return res;
        },
    },
};
function _send(fd, buf, len, flags) {
    var sock = SOCKFS.getSocket(fd);
    if (!sock) {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
    }
    return _write(fd, buf, len);
}
function _pwrite(fildes, buf, nbyte, offset) {
    var stream = FS.getStream(fildes);
    if (!stream) {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
    }
    try {
        var slab = HEAP8;
        return FS.write(stream, slab, buf, nbyte, offset);
    } catch (e) {
        FS.handleFSError(e);
        return -1;
    }
}
function _write(fildes, buf, nbyte) {
    var stream = FS.getStream(fildes);
    if (!stream) {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
    }
    try {
        var slab = HEAP8;
        return FS.write(stream, slab, buf, nbyte);
    } catch (e) {
        FS.handleFSError(e);
        return -1;
    }
}
function _fputc(c, stream) {
    var chr = unSign(c & 255);
    HEAP8[_fputc.ret >> 0] = chr;
    var fd = _fileno(stream);
    var ret = _write(fd, _fputc.ret, 1);
    if (ret == -1) {
        var streamObj = FS.getStreamFromPtr(stream);
        if (streamObj) streamObj.error = true;
        return -1;
    } else {
        return chr;
    }
}
function _emscripten_glVertexPointer() {
    throw "Legacy GL function (glVertexPointer) called. If you want legacy GL emulation, you need to compile with -s LEGACY_GL_EMULATION=1 to enable legacy GL emulation.";
}
function _emscripten_glUniform3iv(location, count, value) {
    location = GL.uniforms[location];
    count *= 3;
    value = HEAP32.subarray(value >> 2, (value + count * 4) >> 2);
    GLctx.uniform3iv(location, value);
}
var structRegistrations = {};
function runDestructors(destructors) {
    while (destructors.length) {
        var ptr = destructors.pop();
        var del = destructors.pop();
        del(ptr);
    }
}
function __embind_finalize_value_object(structType) {
    var reg = structRegistrations[structType];
    delete structRegistrations[structType];
    var rawConstructor = reg.rawConstructor;
    var rawDestructor = reg.rawDestructor;
    var fieldRecords = reg.fields;
    var fieldTypes = fieldRecords
        .map(function (field) {
            return field.getterReturnType;
        })
        .concat(
            fieldRecords.map(function (field) {
                return field.setterArgumentType;
            })
        );
    whenDependentTypesAreResolved([structType], fieldTypes, function (fieldTypes) {
        var fields = {};
        fieldRecords.forEach(function (field, i) {
            var fieldName = field.fieldName;
            var getterReturnType = fieldTypes[i];
            var getter = field.getter;
            var getterContext = field.getterContext;
            var setterArgumentType = fieldTypes[i + fieldRecords.length];
            var setter = field.setter;
            var setterContext = field.setterContext;
            fields[fieldName] = {
                read: function (ptr) {
                    return getterReturnType["fromWireType"](getter(getterContext, ptr));
                },
                write: function (ptr, o) {
                    var destructors = [];
                    setter(setterContext, ptr, setterArgumentType["toWireType"](destructors, o));
                    runDestructors(destructors);
                },
            };
        });
        return [
            {
                name: reg.name,
                fromWireType: function (ptr) {
                    var rv = {};
                    for (var i in fields) {
                        rv[i] = fields[i].read(ptr);
                    }
                    rawDestructor(ptr);
                    return rv;
                },
                toWireType: function (destructors, o) {
                    for (var fieldName in fields) {
                        if (!(fieldName in o)) {
                            throw new TypeError("Missing field");
                        }
                    }
                    var ptr = rawConstructor();
                    for (fieldName in fields) {
                        fields[fieldName].write(ptr, o[fieldName]);
                    }
                    if (destructors !== null) {
                        destructors.push(rawDestructor, ptr);
                    }
                    return ptr;
                },
                argPackAdvance: 8,
                readValueFromPointer: simpleReadValueFromPointer,
                destructorFunction: rawDestructor,
            },
        ];
    });
}
function _fwrite(ptr, size, nitems, stream) {
    var bytesToWrite = nitems * size;
    if (bytesToWrite == 0) return 0;
    var fd = _fileno(stream);
    var bytesWritten = _write(fd, ptr, bytesToWrite);
    if (bytesWritten == -1) {
        var streamObj = FS.getStreamFromPtr(stream);
        if (streamObj) streamObj.error = true;
        return 0;
    } else {
        return (bytesWritten / size) | 0;
    }
}
function _emscripten_glIsFramebuffer(framebuffer) {
    var fb = GL.framebuffers[framebuffer];
    if (!fb) return 0;
    return GLctx.isFramebuffer(fb);
}
function _emscripten_glClientActiveTexture() {
    Module["printErr"]("missing function: emscripten_glClientActiveTexture");
    abort(-1);
}
function _emscripten_glReleaseShaderCompiler() {}
function _emscripten_glGetShaderInfoLog(shader, maxLength, length, infoLog) {
    var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
    if (!log) log = "(unknown error)";
    log = log.substr(0, maxLength - 1);
    if (maxLength > 0 && infoLog) {
        writeStringToMemory(log, infoLog);
        if (length) HEAP32[length >> 2] = log.length;
    } else {
        if (length) HEAP32[length >> 2] = 0;
    }
}
function _emscripten_glIsTexture(texture) {
    var texture = GL.textures[texture];
    if (!texture) return 0;
    return GLctx.isTexture(texture);
}
function _emscripten_glTexParameterf(x0, x1, x2) {
    GLctx.texParameterf(x0, x1, x2);
}
function _emscripten_glGetRenderbufferParameteriv(target, pname, params) {
    HEAP32[params >> 2] = GLctx.getRenderbufferParameter(target, pname);
}
function _emscripten_glStencilOpSeparate(x0, x1, x2, x3) {
    GLctx.stencilOpSeparate(x0, x1, x2, x3);
}
function _emscripten_set_main_loop_timing(mode, value) {
    Browser.mainLoop.timingMode = mode;
    Browser.mainLoop.timingValue = value;
    if (!Browser.mainLoop.func) {
        return 1;
    }
    if (mode == 0) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler() {
            setTimeout(Browser.mainLoop.runner, value);
        };
        Browser.mainLoop.method = "timeout";
    } else if (mode == 1) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler() {
            Browser.requestAnimationFrame(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = "rAF";
    }
    return 0;
}
function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg) {
    Module["noExitRuntime"] = true;
    assert(!Browser.mainLoop.func, "emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.");
    Browser.mainLoop.func = func;
    Browser.mainLoop.arg = arg;
    var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
    Browser.mainLoop.runner = function Browser_mainLoop_runner() {
        if (ABORT) return;
        if (Browser.mainLoop.queue.length > 0) {
            var start = Date.now();
            var blocker = Browser.mainLoop.queue.shift();
            blocker.func(blocker.arg);
            if (Browser.mainLoop.remainingBlockers) {
                var remaining = Browser.mainLoop.remainingBlockers;
                var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
                if (blocker.counted) {
                    Browser.mainLoop.remainingBlockers = next;
                } else {
                    next = next + 0.5;
                    Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9;
                }
            }
            console.log('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + " ms");
            Browser.mainLoop.updateStatus();
            setTimeout(Browser.mainLoop.runner, 0);
            return;
        }
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
        Browser.mainLoop.currentFrameNumber = (Browser.mainLoop.currentFrameNumber + 1) | 0;
        if (Browser.mainLoop.timingMode == 1 && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
            Browser.mainLoop.scheduler();
            return;
        }
        if (Browser.mainLoop.method === "timeout" && Module.ctx) {
            Module.printErr(
                "Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!"
            );
            Browser.mainLoop.method = "";
        }
        Browser.mainLoop.runIter(function () {
            if (typeof arg !== "undefined") {
                Runtime.dynCall("vi", func, [arg]);
            } else {
                Runtime.dynCall("v", func);
            }
        });
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
        if (typeof SDL === "object" && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();
        Browser.mainLoop.scheduler();
    };
    if (fps && fps > 0) _emscripten_set_main_loop_timing(0, 1e3 / fps);
    else _emscripten_set_main_loop_timing(1, 1);
    Browser.mainLoop.scheduler();
    if (simulateInfiniteLoop) {
        throw "SimulateInfiniteLoop";
    }
}
var Browser = {
    mainLoop: {
        scheduler: null,
        method: "",
        currentlyRunningMainloop: 0,
        func: null,
        arg: 0,
        timingMode: 0,
        timingValue: 0,
        currentFrameNumber: 0,
        queue: [],
        pause: function () {
            Browser.mainLoop.scheduler = null;
            Browser.mainLoop.currentlyRunningMainloop++;
        },
        resume: function () {
            Browser.mainLoop.currentlyRunningMainloop++;
            var timingMode = Browser.mainLoop.timingMode;
            var timingValue = Browser.mainLoop.timingValue;
            var func = Browser.mainLoop.func;
            Browser.mainLoop.func = null;
            _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg);
            _emscripten_set_main_loop_timing(timingMode, timingValue);
        },
        updateStatus: function () {
            if (Module["setStatus"]) {
                var message = Module["statusMessage"] || "Please wait...";
                var remaining = Browser.mainLoop.remainingBlockers;
                var expected = Browser.mainLoop.expectedBlockers;
                if (remaining) {
                    if (remaining < expected) {
                        Module["setStatus"](message + " (" + (expected - remaining) + "/" + expected + ")");
                    } else {
                        Module["setStatus"](message);
                    }
                } else {
                    Module["setStatus"]("");
                }
            }
        },
        runIter: function (func) {
            if (ABORT) return;
            if (Module["preMainLoop"]) {
                var preRet = Module["preMainLoop"]();
                if (preRet === false) {
                    return;
                }
            }
            try {
                func();
            } catch (e) {
                if (e instanceof ExitStatus) {
                    return;
                } else {
                    if (e && typeof e === "object" && e.stack) Module.printErr("exception thrown: " + [e, e.stack]);
                    throw e;
                }
            }
            if (Module["postMainLoop"]) Module["postMainLoop"]();
        },
    },
    isFullScreen: false,
    pointerLock: false,
    moduleContextCreatedCallbacks: [],
    workers: [],
    init: function () {
        if (!Module["preloadPlugins"]) Module["preloadPlugins"] = [];
        if (Browser.initted) return;
        Browser.initted = true;
        try {
            new Blob();
            Browser.hasBlobConstructor = true;
        } catch (e) {
            Browser.hasBlobConstructor = false;
            console.log("warning: no blob constructor, cannot create blobs with mimetypes");
        }
        Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : !Browser.hasBlobConstructor ? console.log("warning: no BlobBuilder") : null;
        Browser.URLObject = typeof window != "undefined" ? (window.URL ? window.URL : window.webkitURL) : undefined;
        if (!Module.noImageDecoding && typeof Browser.URLObject === "undefined") {
            console.log("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
            Module.noImageDecoding = true;
        }
        var imagePlugin = {};
        imagePlugin["canHandle"] = function imagePlugin_canHandle(name) {
            return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
        };
        imagePlugin["handle"] = function imagePlugin_handle(byteArray, name, onload, onerror) {
            var b = null;
            if (Browser.hasBlobConstructor) {
                try {
                    b = new Blob([byteArray], { type: Browser.getMimetype(name) });
                    if (b.size !== byteArray.length) {
                        b = new Blob([new Uint8Array(byteArray).buffer], { type: Browser.getMimetype(name) });
                    }
                } catch (e) {
                    Runtime.warnOnce("Blob constructor present but fails: " + e + "; falling back to blob builder");
                }
            }
            if (!b) {
                var bb = new Browser.BlobBuilder();
                bb.append(new Uint8Array(byteArray).buffer);
                b = bb.getBlob();
            }
            var url = Browser.URLObject.createObjectURL(b);
            var img = new Image();
            img.onload = function img_onload() {
                assert(img.complete, "Image " + name + " could not be decoded");
                var canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                var ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                Module["preloadedImages"][name] = canvas;
                Browser.URLObject.revokeObjectURL(url);
                if (onload) onload(byteArray);
            };
            img.onerror = function img_onerror(event) {
                console.log("Image " + url + " could not be decoded");
                if (onerror) onerror();
            };
            img.src = url;
        };
        Module["preloadPlugins"].push(imagePlugin);
        var audioPlugin = {};
        audioPlugin["canHandle"] = function audioPlugin_canHandle(name) {
            return !Module.noAudioDecoding && name.substr(-4) in { ".ogg": 1, ".wav": 1, ".mp3": 1 };
        };
        audioPlugin["handle"] = function audioPlugin_handle(byteArray, name, onload, onerror) {
            var done = false;
            function finish(audio) {
                if (done) return;
                done = true;
                Module["preloadedAudios"][name] = audio;
                if (onload) onload(byteArray);
            }
            function fail() {
                if (done) return;
                done = true;
                Module["preloadedAudios"][name] = new Audio();
                if (onerror) onerror();
            }
            if (Browser.hasBlobConstructor) {
                try {
                    var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
                } catch (e) {
                    return fail();
                }
                var url = Browser.URLObject.createObjectURL(b);
                var audio = new Audio();
                audio.addEventListener(
                    "canplaythrough",
                    function () {
                        finish(audio);
                    },
                    false
                );
                audio.onerror = function audio_onerror(event) {
                    if (done) return;
                    console.log("warning: browser could not fully decode audio " + name + ", trying slower base64 approach");
                    function encode64(data) {
                        var BASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                        var PAD = "=";
                        var ret = "";
                        var leftchar = 0;
                        var leftbits = 0;
                        for (var i = 0; i < data.length; i++) {
                            leftchar = (leftchar << 8) | data[i];
                            leftbits += 8;
                            while (leftbits >= 6) {
                                var curr = (leftchar >> (leftbits - 6)) & 63;
                                leftbits -= 6;
                                ret += BASE[curr];
                            }
                        }
                        if (leftbits == 2) {
                            ret += BASE[(leftchar & 3) << 4];
                            ret += PAD + PAD;
                        } else if (leftbits == 4) {
                            ret += BASE[(leftchar & 15) << 2];
                            ret += PAD;
                        }
                        return ret;
                    }
                    audio.src = "data:audio/x-" + name.substr(-3) + ";base64," + encode64(byteArray);
                    finish(audio);
                };
                audio.src = url;
                Browser.safeSetTimeout(function () {
                    finish(audio);
                }, 1e4);
            } else {
                return fail();
            }
        };
        Module["preloadPlugins"].push(audioPlugin);
        var canvas = Module["canvas"];
        function pointerLockChange() {
            Browser.pointerLock = document["pointerLockElement"] === canvas || document["mozPointerLockElement"] === canvas || document["webkitPointerLockElement"] === canvas || document["msPointerLockElement"] === canvas;
        }
        if (canvas) {
            canvas.requestPointerLock = canvas["requestPointerLock"] || canvas["mozRequestPointerLock"] || canvas["webkitRequestPointerLock"] || canvas["msRequestPointerLock"] || function () {};
            canvas.exitPointerLock = document["exitPointerLock"] || document["mozExitPointerLock"] || document["webkitExitPointerLock"] || document["msExitPointerLock"] || function () {};
            canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
            document.addEventListener("pointerlockchange", pointerLockChange, false);
            document.addEventListener("mozpointerlockchange", pointerLockChange, false);
            document.addEventListener("webkitpointerlockchange", pointerLockChange, false);
            document.addEventListener("mspointerlockchange", pointerLockChange, false);
            if (Module["elementPointerLock"]) {
                canvas.addEventListener(
                    "click",
                    function (ev) {
                        if (!Browser.pointerLock && canvas.requestPointerLock) {
                            canvas.requestPointerLock();
                            ev.preventDefault();
                        }
                    },
                    false
                );
            }
        }
    },
    createContext: function (canvas, useWebGL, setInModule, webGLContextAttributes) {
        if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx;
        var ctx;
        var contextHandle;
        if (useWebGL) {
            var contextAttributes = { antialias: false, alpha: false };
            if (webGLContextAttributes) {
                for (var attribute in webGLContextAttributes) {
                    contextAttributes[attribute] = webGLContextAttributes[attribute];
                }
            }
            contextHandle = GL.createContext(canvas, contextAttributes);
            if (contextHandle) {
                ctx = GL.getContext(contextHandle).GLctx;
            }
            canvas.style.backgroundColor = "black";
        } else {
            ctx = canvas.getContext("2d");
        }
        if (!ctx) return null;
        if (setInModule) {
            if (!useWebGL) assert(typeof GLctx === "undefined", "cannot set in module if GLctx is used, but we are a non-GL context that would replace it");
            Module.ctx = ctx;
            if (useWebGL) GL.makeContextCurrent(contextHandle);
            Module.useWebGL = useWebGL;
            Browser.moduleContextCreatedCallbacks.forEach(function (callback) {
                callback();
            });
            Browser.init();
        }
        return ctx;
    },
    destroyContext: function (canvas, useWebGL, setInModule) {},
    fullScreenHandlersInstalled: false,
    lockPointer: undefined,
    resizeCanvas: undefined,
    requestFullScreen: function (lockPointer, resizeCanvas) {
        Browser.lockPointer = lockPointer;
        Browser.resizeCanvas = resizeCanvas;
        if (typeof Browser.lockPointer === "undefined") Browser.lockPointer = true;
        if (typeof Browser.resizeCanvas === "undefined") Browser.resizeCanvas = false;
        var canvas = Module["canvas"];
        function fullScreenChange() {
            Browser.isFullScreen = false;
            var canvasContainer = canvas.parentNode;
            if (
                (document["webkitFullScreenElement"] ||
                    document["webkitFullscreenElement"] ||
                    document["mozFullScreenElement"] ||
                    document["mozFullscreenElement"] ||
                    document["fullScreenElement"] ||
                    document["fullscreenElement"] ||
                    document["msFullScreenElement"] ||
                    document["msFullscreenElement"] ||
                    document["webkitCurrentFullScreenElement"]) === canvasContainer
            ) {
                canvas.cancelFullScreen = document["cancelFullScreen"] || document["mozCancelFullScreen"] || document["webkitCancelFullScreen"] || document["msExitFullscreen"] || document["exitFullscreen"] || function () {};
                canvas.cancelFullScreen = canvas.cancelFullScreen.bind(document);
                if (Browser.lockPointer) canvas.requestPointerLock();
                Browser.isFullScreen = true;
                if (Browser.resizeCanvas) Browser.setFullScreenCanvasSize();
            } else {
                canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
                canvasContainer.parentNode.removeChild(canvasContainer);
                if (Browser.resizeCanvas) Browser.setWindowedCanvasSize();
            }
            if (Module["onFullScreen"]) Module["onFullScreen"](Browser.isFullScreen);
            Browser.updateCanvasDimensions(canvas);
        }
        if (!Browser.fullScreenHandlersInstalled) {
            Browser.fullScreenHandlersInstalled = true;
            document.addEventListener("fullscreenchange", fullScreenChange, false);
            document.addEventListener("mozfullscreenchange", fullScreenChange, false);
            document.addEventListener("webkitfullscreenchange", fullScreenChange, false);
            document.addEventListener("MSFullscreenChange", fullScreenChange, false);
        }
        var canvasContainer = document.createElement("div");
        canvas.parentNode.insertBefore(canvasContainer, canvas);
        canvasContainer.appendChild(canvas);
        canvasContainer.requestFullScreen =
            canvasContainer["requestFullScreen"] ||
            canvasContainer["mozRequestFullScreen"] ||
            canvasContainer["msRequestFullscreen"] ||
            (canvasContainer["webkitRequestFullScreen"]
                ? function () {
                      canvasContainer["webkitRequestFullScreen"](Element["ALLOW_KEYBOARD_INPUT"]);
                  }
                : null);
        canvasContainer.requestFullScreen();
    },
    nextRAF: 0,
    fakeRequestAnimationFrame: function (func) {
        var now = Date.now();
        if (Browser.nextRAF === 0) {
            Browser.nextRAF = now + 1e3 / 60;
        } else {
            while (now + 2 >= Browser.nextRAF) {
                Browser.nextRAF += 1e3 / 60;
            }
        }
        var delay = Math.max(Browser.nextRAF - now, 0);
        setTimeout(func, delay);
    },
    requestAnimationFrame: function requestAnimationFrame(func) {
        if (typeof window === "undefined") {
            Browser.fakeRequestAnimationFrame(func);
        } else {
            if (!window.requestAnimationFrame) {
                window.requestAnimationFrame =
                    window["requestAnimationFrame"] ||
                    window["mozRequestAnimationFrame"] ||
                    window["webkitRequestAnimationFrame"] ||
                    window["msRequestAnimationFrame"] ||
                    window["oRequestAnimationFrame"] ||
                    Browser.fakeRequestAnimationFrame;
            }
            window.requestAnimationFrame(func);
        }
    },
    safeCallback: function (func) {
        return function () {
            if (!ABORT) return func.apply(null, arguments);
        };
    },
    safeRequestAnimationFrame: function (func) {
        return Browser.requestAnimationFrame(function () {
            if (!ABORT) func();
        });
    },
    safeSetTimeout: function (func, timeout) {
        Module["noExitRuntime"] = true;
        return setTimeout(function () {
            if (!ABORT) func();
        }, timeout);
    },
    safeSetInterval: function (func, timeout) {
        Module["noExitRuntime"] = true;
        return setInterval(function () {
            if (!ABORT) func();
        }, timeout);
    },
    getMimetype: function (name) {
        return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", bmp: "image/bmp", ogg: "audio/ogg", wav: "audio/wav", mp3: "audio/mpeg" }[name.substr(name.lastIndexOf(".") + 1)];
    },
    getUserMedia: function (func) {
        if (!window.getUserMedia) {
            window.getUserMedia = navigator["getUserMedia"] || navigator["mozGetUserMedia"];
        }
        window.getUserMedia(func);
    },
    getMovementX: function (event) {
        return event["movementX"] || event["mozMovementX"] || event["webkitMovementX"] || 0;
    },
    getMovementY: function (event) {
        return event["movementY"] || event["mozMovementY"] || event["webkitMovementY"] || 0;
    },
    getMouseWheelDelta: function (event) {
        var delta = 0;
        switch (event.type) {
            case "DOMMouseScroll":
                delta = event.detail;
                break;
            case "mousewheel":
                delta = event.wheelDelta;
                break;
            case "wheel":
                delta = event["deltaY"];
                break;
            default:
                throw "unrecognized mouse wheel event: " + event.type;
        }
        return delta;
    },
    mouseX: 0,
    mouseY: 0,
    mouseMovementX: 0,
    mouseMovementY: 0,
    touches: {},
    lastTouches: {},
    calculateMouseEvent: function (event) {
        if (Browser.pointerLock) {
            if (event.type != "mousemove" && "mozMovementX" in event) {
                Browser.mouseMovementX = Browser.mouseMovementY = 0;
            } else {
                Browser.mouseMovementX = Browser.getMovementX(event);
                Browser.mouseMovementY = Browser.getMovementY(event);
            }
            if (typeof SDL != "undefined") {
                Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
                Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
            } else {
                Browser.mouseX += Browser.mouseMovementX;
                Browser.mouseY += Browser.mouseMovementY;
            }
        } else {
            var rect = Module["canvas"].getBoundingClientRect();
            var cw = Module["canvas"].width;
            var ch = Module["canvas"].height;
            var scrollX = typeof window.scrollX !== "undefined" ? window.scrollX : window.pageXOffset;
            var scrollY = typeof window.scrollY !== "undefined" ? window.scrollY : window.pageYOffset;
            if (event.type === "touchstart" || event.type === "touchend" || event.type === "touchmove") {
                var touch = event.touch;
                if (touch === undefined) {
                    return;
                }
                var adjustedX = touch.pageX - (scrollX + rect.left);
                var adjustedY = touch.pageY - (scrollY + rect.top);
                adjustedX = adjustedX * (cw / rect.width);
                adjustedY = adjustedY * (ch / rect.height);
                var coords = { x: adjustedX, y: adjustedY };
                if (event.type === "touchstart") {
                    Browser.lastTouches[touch.identifier] = coords;
                    Browser.touches[touch.identifier] = coords;
                } else if (event.type === "touchend" || event.type === "touchmove") {
                    Browser.lastTouches[touch.identifier] = Browser.touches[touch.identifier];
                    Browser.touches[touch.identifier] = { x: adjustedX, y: adjustedY };
                }
                return;
            }
            var x = event.pageX - (scrollX + rect.left);
            var y = event.pageY - (scrollY + rect.top);
            x = x * (cw / rect.width);
            y = y * (ch / rect.height);
            Browser.mouseMovementX = x - Browser.mouseX;
            Browser.mouseMovementY = y - Browser.mouseY;
            Browser.mouseX = x;
            Browser.mouseY = y;
        }
    },
    xhrLoad: function (url, onload, onerror) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "arraybuffer";
        xhr.onload = function xhr_onload() {
            if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
                onload(xhr.response);
            } else {
                onerror();
            }
        };
        xhr.onerror = onerror;
        xhr.send(null);
    },
    asyncLoad: function (url, onload, onerror, noRunDep) {
        Browser.xhrLoad(
            url,
            function (arrayBuffer) {
                assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
                onload(new Uint8Array(arrayBuffer));
                if (!noRunDep) removeRunDependency("al " + url);
            },
            function (event) {
                if (onerror) {
                    onerror();
                } else {
                    throw 'Loading data file "' + url + '" failed.';
                }
            }
        );
        if (!noRunDep) addRunDependency("al " + url);
    },
    resizeListeners: [],
    updateResizeListeners: function () {
        var canvas = Module["canvas"];
        Browser.resizeListeners.forEach(function (listener) {
            listener(canvas.width, canvas.height);
        });
    },
    setCanvasSize: function (width, height, noUpdates) {
        var canvas = Module["canvas"];
        Browser.updateCanvasDimensions(canvas, width, height);
        if (!noUpdates) Browser.updateResizeListeners();
    },
    windowedWidth: 0,
    windowedHeight: 0,
    setFullScreenCanvasSize: function () {
        if (typeof SDL != "undefined") {
            var flags = HEAPU32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2];
            flags = flags | 8388608;
            HEAP32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2] = flags;
        }
        Browser.updateResizeListeners();
    },
    setWindowedCanvasSize: function () {
        if (typeof SDL != "undefined") {
            var flags = HEAPU32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2];
            flags = flags & ~8388608;
            HEAP32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2] = flags;
        }
        Browser.updateResizeListeners();
    },
    updateCanvasDimensions: function (canvas, wNative, hNative) {
        if (wNative && hNative) {
            canvas.widthNative = wNative;
            canvas.heightNative = hNative;
        } else {
            wNative = canvas.widthNative;
            hNative = canvas.heightNative;
        }
        var w = wNative;
        var h = hNative;
        if (Module["forcedAspectRatio"] && Module["forcedAspectRatio"] > 0) {
            if (w / h < Module["forcedAspectRatio"]) {
                w = Math.round(h * Module["forcedAspectRatio"]);
            } else {
                h = Math.round(w / Module["forcedAspectRatio"]);
            }
        }
        if (
            (document["webkitFullScreenElement"] ||
                document["webkitFullscreenElement"] ||
                document["mozFullScreenElement"] ||
                document["mozFullscreenElement"] ||
                document["fullScreenElement"] ||
                document["fullscreenElement"] ||
                document["msFullScreenElement"] ||
                document["msFullscreenElement"] ||
                document["webkitCurrentFullScreenElement"]) === canvas.parentNode &&
            typeof screen != "undefined"
        ) {
            var factor = Math.min(screen.width / w, screen.height / h);
            w = Math.round(w * factor);
            h = Math.round(h * factor);
        }
        if (Browser.resizeCanvas) {
            if (canvas.width != w) canvas.width = w;
            if (canvas.height != h) canvas.height = h;
            if (typeof canvas.style != "undefined") {
                canvas.style.removeProperty("width");
                canvas.style.removeProperty("height");
            }
        } else {
            if (canvas.width != wNative) canvas.width = wNative;
            if (canvas.height != hNative) canvas.height = hNative;
            if (typeof canvas.style != "undefined") {
                if (w != wNative || h != hNative) {
                    canvas.style.setProperty("width", w + "px", "important");
                    canvas.style.setProperty("height", h + "px", "important");
                } else {
                    canvas.style.removeProperty("width");
                    canvas.style.removeProperty("height");
                }
            }
        }
    },
    wgetRequests: {},
    nextWgetRequestHandle: 0,
    getNextWgetRequestHandle: function () {
        var handle = Browser.nextWgetRequestHandle;
        Browser.nextWgetRequestHandle++;
        return handle;
    },
};
function _emscripten_glTexParameteri(x0, x1, x2) {
    GLctx.texParameteri(x0, x1, x2);
}
function _emscripten_glReadPixels(x, y, width, height, format, type, pixels) {
    var data = GL.getTexPixelData(type, format, width, height, pixels, format);
    if (!data.pixels) {
        GL.recordError(1280);
        return;
    }
    GLctx.readPixels(x, y, width, height, format, type, data.pixels);
}
function _emscripten_glCompressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data) {
    if (data) {
        data = HEAPU8.subarray(data, data + imageSize);
    } else {
        data = null;
    }
    GLctx["compressedTexSubImage2D"](target, level, xoffset, yoffset, width, height, format, data);
}
function _emscripten_glGetError() {
    if (GL.lastError) {
        var error = GL.lastError;
        GL.lastError = 0;
        return error;
    } else {
        return GLctx.getError();
    }
}
function _emscripten_glUniform4f(location, v0, v1, v2, v3) {
    location = GL.uniforms[location];
    GLctx.uniform4f(location, v0, v1, v2, v3);
}
function _emscripten_glFramebufferTexture2D(target, attachment, textarget, texture, level) {
    GLctx.framebufferTexture2D(target, attachment, textarget, GL.textures[texture], level);
}
function _emscripten_glFrustum() {
    Module["printErr"]("missing function: emscripten_glFrustum");
    abort(-1);
}
function _emscripten_glGetTexParameterfv(target, pname, params) {
    HEAPF32[params >> 2] = GLctx.getTexParameter(target, pname);
}
function _emscripten_glUniform4i(location, v0, v1, v2, v3) {
    location = GL.uniforms[location];
    GLctx.uniform4i(location, v0, v1, v2, v3);
}
function _emscripten_glIsEnabled(x0) {
    return GLctx.isEnabled(x0);
}
function _emscripten_glBindRenderbuffer(target, renderbuffer) {
    GLctx.bindRenderbuffer(target, renderbuffer ? GL.renderbuffers[renderbuffer] : null);
}
function _emscripten_glViewport(x0, x1, x2, x3) {
    GLctx.viewport(x0, x1, x2, x3);
}
function _emscripten_memcpy_big(dest, src, num) {
    HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
    return dest;
}
Module["_memcpy"] = _memcpy;
function _emscripten_glCopyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
    GLctx.copyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7);
}
function _emscripten_glTexParameterfv(target, pname, params) {
    var param = HEAPF32[params >> 2];
    GLctx.texParameterf(target, pname, param);
}
function _emscripten_glClearDepthf(x0) {
    GLctx.clearDepth(x0);
}
function _emscripten_glVertexAttrib4f(x0, x1, x2, x3, x4) {
    GLctx.vertexAttrib4f(x0, x1, x2, x3, x4);
}
function _emscripten_glLinkProgram(program) {
    GLctx.linkProgram(GL.programs[program]);
    GL.programInfos[program] = null;
    GL.populateUniformTable(program);
}
function _emscripten_glUniform3f(location, v0, v1, v2) {
    location = GL.uniforms[location];
    GLctx.uniform3f(location, v0, v1, v2);
}
function __embind_register_memory_view(rawType, dataTypeIndex, name) {
    var typeMapping = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
    var TA = typeMapping[dataTypeIndex];
    function decodeMemoryView(handle) {
        handle = handle >> 2;
        var heap = HEAPU32;
        var size = heap[handle];
        var data = heap[handle + 1];
        return new TA(heap["buffer"], data, size);
    }
    name = readLatin1String(name);
    registerType(rawType, { name: name, fromWireType: decodeMemoryView, argPackAdvance: 8, readValueFromPointer: decodeMemoryView }, { ignoreDuplicateRegistrations: true });
}
function _emscripten_glGetObjectParameterivARB() {
    Module["printErr"]("missing function: emscripten_glGetObjectParameterivARB");
    abort(-1);
}
function _emscripten_glBlendFunc(x0, x1) {
    GLctx.blendFunc(x0, x1);
}
function _emscripten_glUniform3i(location, v0, v1, v2) {
    location = GL.uniforms[location];
    GLctx.uniform3i(location, v0, v1, v2);
}
function _emscripten_glStencilOp(x0, x1, x2) {
    GLctx.stencilOp(x0, x1, x2);
}
function _emscripten_glBindAttribLocation(program, index, name) {
    name = Pointer_stringify(name);
    GLctx.bindAttribLocation(GL.programs[program], index, name);
}
function _emscripten_glBindBuffer(target, buffer) {
    var bufferObj = buffer ? GL.buffers[buffer] : null;
    GLctx.bindBuffer(target, bufferObj);
}
function __embind_register_void(rawType, name) {
    name = readLatin1String(name);
    registerType(rawType, {
        isVoid: true,
        name: name,
        argPackAdvance: 0,
        fromWireType: function () {
            return undefined;
        },
        toWireType: function (destructors, o) {
            return undefined;
        },
    });
}
function _emscripten_glEnableVertexAttribArray(index) {
    GLctx.enableVertexAttribArray(index);
}
Module["_memset"] = _memset;
function _emscripten_glGetUniformfv(program, location, params) {
    var data = GLctx.getUniform(GL.programs[program], GL.uniforms[location]);
    if (typeof data == "number") {
        HEAPF32[params >> 2] = data;
    } else {
        for (var i = 0; i < data.length; i++) {
            HEAPF32[(params + i) >> 2] = data[i];
        }
    }
}
function _emscripten_glUniform1i(location, v0) {
    location = GL.uniforms[location];
    GLctx.uniform1i(location, v0);
}
function _emscripten_glGetProgramiv(program, pname, p) {
    if (pname == 35716) {
        HEAP32[p >> 2] = GLctx.getProgramInfoLog(GL.programs[program]).length + 1;
    } else if (pname == 35719) {
        var ptable = GL.programInfos[program];
        if (ptable) {
            HEAP32[p >> 2] = ptable.maxUniformLength;
            return;
        } else if (program < GL.counter) {
            GL.recordError(1282);
        } else {
            GL.recordError(1281);
        }
    } else if (pname == 35722) {
        var ptable = GL.programInfos[program];
        if (ptable) {
            if (ptable.maxAttributeLength == -1) {
                var program = GL.programs[program];
                var numAttribs = GLctx.getProgramParameter(program, GLctx.ACTIVE_ATTRIBUTES);
                ptable.maxAttributeLength = 0;
                for (var i = 0; i < numAttribs; ++i) {
                    var activeAttrib = GLctx.getActiveAttrib(program, i);
                    ptable.maxAttributeLength = Math.max(ptable.maxAttributeLength, activeAttrib.name.length + 1);
                }
            }
            HEAP32[p >> 2] = ptable.maxAttributeLength;
            return;
        } else if (program < GL.counter) {
            GL.recordError(1282);
        } else {
            GL.recordError(1281);
        }
    } else {
        HEAP32[p >> 2] = GLctx.getProgramParameter(GL.programs[program], pname);
    }
}
function _emscripten_glGetBufferParameteriv(target, value, data) {
    HEAP32[data >> 2] = GLctx.getBufferParameter(target, value);
}
function ___assert_fail(condition, filename, line, func) {
    ABORT = true;
    throw "Assertion failed: " + Pointer_stringify(condition) + ", at: " + [filename ? Pointer_stringify(filename) : "unknown filename", line, func ? Pointer_stringify(func) : "unknown function"] + " at " + stackTrace();
}
function _emscripten_glDrawRangeElements() {
    Module["printErr"]("missing function: emscripten_glDrawRangeElements");
    abort(-1);
}
function _emscripten_glGetAttachedShaders(program, maxCount, count, shaders) {
    var result = GLctx.getAttachedShaders(GL.programs[program]);
    var len = result.length;
    if (len > maxCount) {
        len = maxCount;
    }
    HEAP32[count >> 2] = len;
    for (var i = 0; i < len; ++i) {
        var id = GL.shaders.indexOf(result[i]);
        HEAP32[(shaders + i * 4) >> 2] = id;
    }
}
function requireFunction(signature, rawFunction) {
    signature = readLatin1String(signature);
    function makeDynCaller(dynCall) {
        var args = [];
        for (var i = 1; i < signature.length; ++i) {
            args.push("a" + i);
        }
        var name = "dynCall_" + signature + "_" + rawFunction;
        var body = "return function " + name + "(" + args.join(", ") + ") {\n";
        body += "    return dynCall(rawFunction" + (args.length ? ", " : "") + args.join(", ") + ");\n";
        body += "};\n";
        return new Function("dynCall", "rawFunction", body)(dynCall, rawFunction);
    }
    var fp;
    if (Module["FUNCTION_TABLE_" + signature] !== undefined) {
        fp = Module["FUNCTION_TABLE_" + signature][rawFunction];
    } else if (typeof FUNCTION_TABLE !== "undefined") {
        fp = FUNCTION_TABLE[rawFunction];
    } else {
        var dc = asm["dynCall_" + signature];
        if (dc === undefined) {
            dc = asm["dynCall_" + signature.replace(/f/g, "d")];
            if (dc === undefined) {
                throwBindingError("No dynCall invoker for signature: " + signature);
            }
        }
        fp = makeDynCaller(dc);
    }
    if (typeof fp !== "function") {
        throwBindingError("unknown function pointer with signature " + signature + ": " + rawFunction);
    }
    return fp;
}
function __embind_register_value_object_field(structType, fieldName, getterReturnType, getterSignature, getter, getterContext, setterArgumentType, setterSignature, setter, setterContext) {
    structRegistrations[structType].fields.push({
        fieldName: readLatin1String(fieldName),
        getterReturnType: getterReturnType,
        getter: requireFunction(getterSignature, getter),
        getterContext: getterContext,
        setterArgumentType: setterArgumentType,
        setter: requireFunction(setterSignature, setter),
        setterContext: setterContext,
    });
}
function ClassHandle_isAliasOf(other) {
    if (!(this instanceof ClassHandle)) {
        return false;
    }
    if (!(other instanceof ClassHandle)) {
        return false;
    }
    var leftClass = this.$$.ptrType.registeredClass;
    var left = this.$$.ptr;
    var rightClass = other.$$.ptrType.registeredClass;
    var right = other.$$.ptr;
    while (leftClass.baseClass) {
        left = leftClass.upcast(left);
        leftClass = leftClass.baseClass;
    }
    while (rightClass.baseClass) {
        right = rightClass.upcast(right);
        rightClass = rightClass.baseClass;
    }
    return leftClass === rightClass && left === right;
}
function shallowCopyInternalPointer(o) {
    return { count: o.count, deleteScheduled: o.deleteScheduled, preservePointerOnDelete: o.preservePointerOnDelete, ptr: o.ptr, ptrType: o.ptrType, smartPtr: o.smartPtr, smartPtrType: o.smartPtrType };
}
function throwInstanceAlreadyDeleted(obj) {
    function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
    }
    throwBindingError(getInstanceTypeName(obj) + " instance already deleted");
}
function ClassHandle_clone() {
    if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
    }
    if (this.$$.preservePointerOnDelete) {
        this.$$.count.value += 1;
        return this;
    } else {
        var clone = Object.create(Object.getPrototypeOf(this), { $$: { value: shallowCopyInternalPointer(this.$$) } });
        clone.$$.count.value += 1;
        clone.$$.deleteScheduled = false;
        return clone;
    }
}
function runDestructor(handle) {
    var $$ = handle.$$;
    if ($$.smartPtr) {
        $$.smartPtrType.rawDestructor($$.smartPtr);
    } else {
        $$.ptrType.registeredClass.rawDestructor($$.ptr);
    }
}
function ClassHandle_delete() {
    if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
    }
    if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
        throwBindingError("Object already scheduled for deletion");
    }
    this.$$.count.value -= 1;
    var toDelete = 0 === this.$$.count.value;
    if (toDelete) {
        runDestructor(this);
    }
    if (!this.$$.preservePointerOnDelete) {
        this.$$.smartPtr = undefined;
        this.$$.ptr = undefined;
    }
}
function ClassHandle_isDeleted() {
    return !this.$$.ptr;
}
var delayFunction = undefined;
var deletionQueue = [];
function flushPendingDeletes() {
    while (deletionQueue.length) {
        var obj = deletionQueue.pop();
        obj.$$.deleteScheduled = false;
        obj["delete"]();
    }
}
function ClassHandle_deleteLater() {
    if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
    }
    if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
        throwBindingError("Object already scheduled for deletion");
    }
    deletionQueue.push(this);
    if (deletionQueue.length === 1 && delayFunction) {
        delayFunction(flushPendingDeletes);
    }
    this.$$.deleteScheduled = true;
    return this;
}
function init_ClassHandle() {
    ClassHandle.prototype["isAliasOf"] = ClassHandle_isAliasOf;
    ClassHandle.prototype["clone"] = ClassHandle_clone;
    ClassHandle.prototype["delete"] = ClassHandle_delete;
    ClassHandle.prototype["isDeleted"] = ClassHandle_isDeleted;
    ClassHandle.prototype["deleteLater"] = ClassHandle_deleteLater;
}
function ClassHandle() {}
var registeredPointers = {};
function ensureOverloadTable(proto, methodName, humanName) {
    if (undefined === proto[methodName].overloadTable) {
        var prevFunc = proto[methodName];
        proto[methodName] = function () {
            if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
                throwBindingError("Function '" + humanName + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + proto[methodName].overloadTable + ")!");
            }
            return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
        };
        proto[methodName].overloadTable = [];
        proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
    }
}
function exposePublicSymbol(name, value, numArguments) {
    if (Module.hasOwnProperty(name)) {
        if (undefined === numArguments || (undefined !== Module[name].overloadTable && undefined !== Module[name].overloadTable[numArguments])) {
            throwBindingError("Cannot register public name '" + name + "' twice");
        }
        ensureOverloadTable(Module, name, name);
        if (Module.hasOwnProperty(numArguments)) {
            throwBindingError("Cannot register multiple overloads of a function with the same number of arguments (" + numArguments + ")!");
        }
        Module[name].overloadTable[numArguments] = value;
    } else {
        Module[name] = value;
        if (undefined !== numArguments) {
            Module[name].numArguments = numArguments;
        }
    }
}
function RegisteredClass(name, constructor, instancePrototype, rawDestructor, baseClass, getActualType, upcast, downcast) {
    this.name = name;
    this.constructor = constructor;
    this.instancePrototype = instancePrototype;
    this.rawDestructor = rawDestructor;
    this.baseClass = baseClass;
    this.getActualType = getActualType;
    this.upcast = upcast;
    this.downcast = downcast;
    this.pureVirtualFunctions = [];
}
function upcastPointer(ptr, ptrClass, desiredClass) {
    while (ptrClass !== desiredClass) {
        if (!ptrClass.upcast) {
            throwBindingError("Expected null or instance of " + desiredClass.name + ", got an instance of " + ptrClass.name);
        }
        ptr = ptrClass.upcast(ptr);
        ptrClass = ptrClass.baseClass;
    }
    return ptr;
}
function constNoSmartPtrRawPointerToWireType(destructors, handle) {
    if (handle === null) {
        if (this.isReference) {
            throwBindingError("null is not a valid " + this.name);
        }
        return 0;
    }
    if (!handle.$$) {
        throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
    }
    if (!handle.$$.ptr) {
        throwBindingError("Cannot pass deleted object as a pointer of type " + this.name);
    }
    var handleClass = handle.$$.ptrType.registeredClass;
    var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
    return ptr;
}
function genericPointerToWireType(destructors, handle) {
    if (handle === null) {
        if (this.isReference) {
            throwBindingError("null is not a valid " + this.name);
        }
        if (this.isSmartPointer) {
            var ptr = this.rawConstructor();
            if (destructors !== null) {
                destructors.push(this.rawDestructor, ptr);
            }
            return ptr;
        } else {
            return 0;
        }
    }
    if (!handle.$$) {
        throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
    }
    if (!handle.$$.ptr) {
        throwBindingError("Cannot pass deleted object as a pointer of type " + this.name);
    }
    if (!this.isConst && handle.$$.ptrType.isConst) {
        throwBindingError("Cannot convert argument of type " + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + " to parameter type " + this.name);
    }
    var handleClass = handle.$$.ptrType.registeredClass;
    var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
    if (this.isSmartPointer) {
        if (undefined === handle.$$.smartPtr) {
            throwBindingError("Passing raw pointer to smart pointer is illegal");
        }
        switch (this.sharingPolicy) {
            case 0:
                if (handle.$$.smartPtrType === this) {
                    ptr = handle.$$.smartPtr;
                } else {
                    throwBindingError("Cannot convert argument of type " + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + " to parameter type " + this.name);
                }
                break;
            case 1:
                ptr = handle.$$.smartPtr;
                break;
            case 2:
                if (handle.$$.smartPtrType === this) {
                    ptr = handle.$$.smartPtr;
                } else {
                    var clonedHandle = handle["clone"]();
                    ptr = this.rawShare(
                        ptr,
                        __emval_register(function () {
                            clonedHandle["delete"]();
                        })
                    );
                    if (destructors !== null) {
                        destructors.push(this.rawDestructor, ptr);
                    }
                }
                break;
            default:
                throwBindingError("Unsupporting sharing policy");
        }
    }
    return ptr;
}
function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
    if (handle === null) {
        if (this.isReference) {
            throwBindingError("null is not a valid " + this.name);
        }
        return 0;
    }
    if (!handle.$$) {
        throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
    }
    if (!handle.$$.ptr) {
        throwBindingError("Cannot pass deleted object as a pointer of type " + this.name);
    }
    if (handle.$$.ptrType.isConst) {
        throwBindingError("Cannot convert argument of type " + handle.$$.ptrType.name + " to parameter type " + this.name);
    }
    var handleClass = handle.$$.ptrType.registeredClass;
    var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
    return ptr;
}
function RegisteredPointer_getPointee(ptr) {
    if (this.rawGetPointee) {
        ptr = this.rawGetPointee(ptr);
    }
    return ptr;
}
function RegisteredPointer_destructor(ptr) {
    if (this.rawDestructor) {
        this.rawDestructor(ptr);
    }
}
function RegisteredPointer_deleteObject(handle) {
    if (handle !== null) {
        handle["delete"]();
    }
}
function downcastPointer(ptr, ptrClass, desiredClass) {
    if (ptrClass === desiredClass) {
        return ptr;
    }
    if (undefined === desiredClass.baseClass) {
        return null;
    }
    var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
    if (rv === null) {
        return null;
    }
    return desiredClass.downcast(rv);
}
function getInheritedInstanceCount() {
    return Object.keys(registeredInstances).length;
}
function getLiveInheritedInstances() {
    var rv = [];
    for (var k in registeredInstances) {
        if (registeredInstances.hasOwnProperty(k)) {
            rv.push(registeredInstances[k]);
        }
    }
    return rv;
}
function setDelayFunction(fn) {
    delayFunction = fn;
    if (deletionQueue.length && delayFunction) {
        delayFunction(flushPendingDeletes);
    }
}
function init_embind() {
    Module["getInheritedInstanceCount"] = getInheritedInstanceCount;
    Module["getLiveInheritedInstances"] = getLiveInheritedInstances;
    Module["flushPendingDeletes"] = flushPendingDeletes;
    Module["setDelayFunction"] = setDelayFunction;
}
var registeredInstances = {};
function getBasestPointer(class_, ptr) {
    if (ptr === undefined) {
        throwBindingError("ptr should not be undefined");
    }
    while (class_.baseClass) {
        ptr = class_.upcast(ptr);
        class_ = class_.baseClass;
    }
    return ptr;
}
function getInheritedInstance(class_, ptr) {
    ptr = getBasestPointer(class_, ptr);
    return registeredInstances[ptr];
}
var _throwInternalError = undefined;
function makeClassHandle(prototype, record) {
    if (!record.ptrType || !record.ptr) {
        throwInternalError("makeClassHandle requires ptr and ptrType");
    }
    var hasSmartPtrType = !!record.smartPtrType;
    var hasSmartPtr = !!record.smartPtr;
    if (hasSmartPtrType !== hasSmartPtr) {
        throwInternalError("Both smartPtrType and smartPtr must be specified");
    }
    record.count = { value: 1 };
    return Object.create(prototype, { $$: { value: record } });
}
function RegisteredPointer_fromWireType(ptr) {
    var rawPointer = this.getPointee(ptr);
    if (!rawPointer) {
        this.destructor(ptr);
        return null;
    }
    var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
    if (undefined !== registeredInstance) {
        if (0 === registeredInstance.$$.count.value) {
            registeredInstance.$$.ptr = rawPointer;
            registeredInstance.$$.smartPtr = ptr;
            return registeredInstance["clone"]();
        } else {
            var rv = registeredInstance["clone"]();
            this.destructor(ptr);
            return rv;
        }
    }
    function makeDefaultHandle() {
        if (this.isSmartPointer) {
            return makeClassHandle(this.registeredClass.instancePrototype, { ptrType: this.pointeeType, ptr: rawPointer, smartPtrType: this, smartPtr: ptr });
        } else {
            return makeClassHandle(this.registeredClass.instancePrototype, { ptrType: this, ptr: ptr });
        }
    }
    var actualType = this.registeredClass.getActualType(rawPointer);
    var registeredPointerRecord = registeredPointers[actualType];
    if (!registeredPointerRecord) {
        return makeDefaultHandle.call(this);
    }
    var toType;
    if (this.isConst) {
        toType = registeredPointerRecord.constPointerType;
    } else {
        toType = registeredPointerRecord.pointerType;
    }
    var dp = downcastPointer(rawPointer, this.registeredClass, toType.registeredClass);
    if (dp === null) {
        return makeDefaultHandle.call(this);
    }
    if (this.isSmartPointer) {
        return makeClassHandle(toType.registeredClass.instancePrototype, { ptrType: toType, ptr: dp, smartPtrType: this, smartPtr: ptr });
    } else {
        return makeClassHandle(toType.registeredClass.instancePrototype, { ptrType: toType, ptr: dp });
    }
}
function init_RegisteredPointer() {
    RegisteredPointer.prototype.getPointee = RegisteredPointer_getPointee;
    RegisteredPointer.prototype.destructor = RegisteredPointer_destructor;
    RegisteredPointer.prototype["argPackAdvance"] = 8;
    RegisteredPointer.prototype["readValueFromPointer"] = simpleReadValueFromPointer;
    RegisteredPointer.prototype["deleteObject"] = RegisteredPointer_deleteObject;
    RegisteredPointer.prototype["fromWireType"] = RegisteredPointer_fromWireType;
}
function RegisteredPointer(name, registeredClass, isReference, isConst, isSmartPointer, pointeeType, sharingPolicy, rawGetPointee, rawConstructor, rawShare, rawDestructor) {
    this.name = name;
    this.registeredClass = registeredClass;
    this.isReference = isReference;
    this.isConst = isConst;
    this.isSmartPointer = isSmartPointer;
    this.pointeeType = pointeeType;
    this.sharingPolicy = sharingPolicy;
    this.rawGetPointee = rawGetPointee;
    this.rawConstructor = rawConstructor;
    this.rawShare = rawShare;
    this.rawDestructor = rawDestructor;
    if (!isSmartPointer && registeredClass.baseClass === undefined) {
        if (isConst) {
            this["toWireType"] = constNoSmartPtrRawPointerToWireType;
            this.destructorFunction = null;
        } else {
            this["toWireType"] = nonConstNoSmartPtrRawPointerToWireType;
            this.destructorFunction = null;
        }
    } else {
        this["toWireType"] = genericPointerToWireType;
    }
}
function replacePublicSymbol(name, value, numArguments) {
    if (!Module.hasOwnProperty(name)) {
        throwInternalError("Replacing nonexistant public symbol");
    }
    if (undefined !== Module[name].overloadTable && undefined !== numArguments) {
        Module[name].overloadTable[numArguments] = value;
    } else {
        Module[name] = value;
    }
}
var UnboundTypeError = undefined;
function throwUnboundTypeError(message, types) {
    var unboundTypes = [];
    var seen = {};
    function visit(type) {
        if (seen[type]) {
            return;
        }
        if (registeredTypes[type]) {
            return;
        }
        if (typeDependencies[type]) {
            typeDependencies[type].forEach(visit);
            return;
        }
        unboundTypes.push(type);
        seen[type] = true;
    }
    types.forEach(visit);
    throw new UnboundTypeError(message + ": " + unboundTypes.map(getTypeName).join([", "]));
}
function __embind_register_class(rawType, rawPointerType, rawConstPointerType, baseClassRawType, getActualTypeSignature, getActualType, upcastSignature, upcast, downcastSignature, downcast, name, destructorSignature, rawDestructor) {
    name = readLatin1String(name);
    getActualType = requireFunction(getActualTypeSignature, getActualType);
    if (upcast) {
        upcast = requireFunction(upcastSignature, upcast);
    }
    if (downcast) {
        downcast = requireFunction(downcastSignature, downcast);
    }
    rawDestructor = requireFunction(destructorSignature, rawDestructor);
    var legalFunctionName = makeLegalFunctionName(name);
    exposePublicSymbol(legalFunctionName, function () {
        throwUnboundTypeError("Cannot construct " + name + " due to unbound types", [baseClassRawType]);
    });
    whenDependentTypesAreResolved([rawType, rawPointerType, rawConstPointerType], baseClassRawType ? [baseClassRawType] : [], function (base) {
        base = base[0];
        var baseClass;
        var basePrototype;
        if (baseClassRawType) {
            baseClass = base.registeredClass;
            basePrototype = baseClass.instancePrototype;
        } else {
            basePrototype = ClassHandle.prototype;
        }
        var constructor = createNamedFunction(legalFunctionName, function () {
            if (Object.getPrototypeOf(this) !== instancePrototype) {
                throw new BindingError("Use 'new' to construct " + name);
            }
            if (undefined === registeredClass.constructor_body) {
                throw new BindingError(name + " has no accessible constructor");
            }
            var body = registeredClass.constructor_body[arguments.length];
            if (undefined === body) {
                throw new BindingError("Tried to invoke ctor of " + name + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(registeredClass.constructor_body).toString() + ") parameters instead!");
            }
            return body.apply(this, arguments);
        });
        var instancePrototype = Object.create(basePrototype, { constructor: { value: constructor } });
        constructor.prototype = instancePrototype;
        var registeredClass = new RegisteredClass(name, constructor, instancePrototype, rawDestructor, baseClass, getActualType, upcast, downcast);
        var referenceConverter = new RegisteredPointer(name, registeredClass, true, false, false);
        var pointerConverter = new RegisteredPointer(name + "*", registeredClass, false, false, false);
        var constPointerConverter = new RegisteredPointer(name + " const*", registeredClass, false, true, false);
        registeredPointers[rawType] = { pointerType: pointerConverter, constPointerType: constPointerConverter };
        replacePublicSymbol(legalFunctionName, constructor);
        return [referenceConverter, pointerConverter, constPointerConverter];
    });
}
function _emscripten_glGenRenderbuffers(n, renderbuffers) {
    for (var i = 0; i < n; i++) {
        var id = GL.getNewId(GL.renderbuffers);
        var renderbuffer = GLctx.createRenderbuffer();
        renderbuffer.name = id;
        GL.renderbuffers[id] = renderbuffer;
        HEAP32[(renderbuffers + i * 4) >> 2] = id;
    }
}
function _emscripten_glBlendFuncSeparate(x0, x1, x2, x3) {
    GLctx.blendFuncSeparate(x0, x1, x2, x3);
}
function _emscripten_glFrontFace(x0) {
    GLctx.frontFace(x0);
}
function _emscripten_glGetVertexAttribPointerv(index, pname, pointer) {
    HEAP32[pointer >> 2] = GLctx.getVertexAttribOffset(index, pname);
}
function _emscripten_glVertexAttrib3f(x0, x1, x2, x3) {
    GLctx.vertexAttrib3f(x0, x1, x2, x3);
}
function _emscripten_glUniform1iv(location, count, value) {
    location = GL.uniforms[location];
    value = HEAP32.subarray(value >> 2, (value + count * 4) >> 2);
    GLctx.uniform1iv(location, value);
}
function _emscripten_glGetAttribLocation(program, name) {
    program = GL.programs[program];
    name = Pointer_stringify(name);
    return GLctx.getAttribLocation(program, name);
}
function _emscripten_glTexCoordPointer() {
    Module["printErr"]("missing function: emscripten_glTexCoordPointer");
    abort(-1);
}
function _emscripten_glEnable(x0) {
    GLctx.enable(x0);
}
function _emscripten_glGetInfoLogARB() {
    Module["printErr"]("missing function: emscripten_glGetInfoLogARB");
    abort(-1);
}
function _emscripten_glNormalPointer() {
    Module["printErr"]("missing function: emscripten_glNormalPointer");
    abort(-1);
}
var emval_free_list = [];
var emval_handle_array = [{}, { value: undefined }, { value: null }, { value: true }, { value: false }];
function __emval_decref(handle) {
    if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
        emval_handle_array[handle] = undefined;
        emval_free_list.push(handle);
    }
}
function count_emval_handles() {
    var count = 0;
    for (var i = 5; i < emval_handle_array.length; ++i) {
        if (emval_handle_array[i] !== undefined) {
            ++count;
        }
    }
    return count;
}
function get_first_emval() {
    for (var i = 1; i < emval_handle_array.length; ++i) {
        if (emval_handle_array[i] !== undefined) {
            return emval_handle_array[i];
        }
    }
    return null;
}
function init_emval() {
    Module["count_emval_handles"] = count_emval_handles;
    Module["get_first_emval"] = get_first_emval;
}
function __emval_register(value) {
    switch (value) {
        case undefined: {
            return 1;
        }
        case null: {
            return 2;
        }
        case true: {
            return 3;
        }
        case false: {
            return 4;
        }
        default: {
            var handle = emval_free_list.length ? emval_free_list.pop() : emval_handle_array.length;
            emval_handle_array[handle] = { refcount: 1, value: value };
            return handle;
        }
    }
}
function __embind_register_emval(rawType, name) {
    name = readLatin1String(name);
    registerType(rawType, {
        name: name,
        fromWireType: function (handle) {
            var rv = emval_handle_array[handle].value;
            __emval_decref(handle);
            return rv;
        },
        toWireType: function (destructors, value) {
            return __emval_register(value);
        },
        argPackAdvance: 8,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction: null,
    });
}
var PTHREAD_SPECIFIC = {};
function _pthread_setspecific(key, value) {
    if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
    }
    PTHREAD_SPECIFIC[key] = value;
    return 0;
}
function _emscripten_glRenderbufferStorage(x0, x1, x2, x3) {
    GLctx.renderbufferStorage(x0, x1, x2, x3);
}
function _emscripten_glGetVertexAttribfv(index, pname, params) {
    var data = GLctx.getVertexAttrib(index, pname);
    if (typeof data == "number") {
        HEAPF32[params >> 2] = data;
    } else {
        for (var i = 0; i < data.length; i++) {
            HEAPF32[(params + i) >> 2] = data[i];
        }
    }
}
function _emscripten_glCopyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
    GLctx.copyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7);
}
function _embind_repr(v) {
    if (v === null) {
        return "null";
    }
    var t = typeof v;
    if (t === "object" || t === "array" || t === "function") {
        return v.toString();
    } else {
        return "" + v;
    }
}
function floatReadValueFromPointer(name, shift) {
    switch (shift) {
        case 2:
            return function (pointer) {
                return this["fromWireType"](HEAPF32[pointer >> 2]);
            };
        case 3:
            return function (pointer) {
                return this["fromWireType"](HEAPF64[pointer >> 3]);
            };
        default:
            throw new TypeError("Unknown float type: " + name);
    }
}
function getShiftFromSize(size) {
    switch (size) {
        case 1:
            return 0;
        case 2:
            return 1;
        case 4:
            return 2;
        case 8:
            return 3;
        default:
            throw new TypeError("Unknown type size: " + size);
    }
}
function __embind_register_float(rawType, name, size) {
    var shift = getShiftFromSize(size);
    name = readLatin1String(name);
    registerType(rawType, {
        name: name,
        fromWireType: function (value) {
            return value;
        },
        toWireType: function (destructors, value) {
            if (typeof value !== "number" && typeof value !== "boolean") {
                throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
            }
            return value;
        },
        argPackAdvance: 8,
        readValueFromPointer: floatReadValueFromPointer(name, shift),
        destructorFunction: null,
    });
}
function _emscripten_glTexParameteriv(target, pname, params) {
    var param = HEAP32[params >> 2];
    GLctx.texParameteri(target, pname, param);
}
function _emscripten_glDeleteShader(id) {
    if (!id) return;
    var shader = GL.shaders[id];
    if (!shader) {
        GL.recordError(1281);
        return;
    }
    GLctx.deleteShader(shader);
    GL.shaders[id] = null;
}
function new_(constructor, argumentList) {
    if (!(constructor instanceof Function)) {
        throw new TypeError("new_ called with constructor type " + typeof constructor + " which is not a function");
    }
    var dummy = createNamedFunction(constructor.name || "unknownFunctionName", function () {});
    dummy.prototype = constructor.prototype;
    var obj = new dummy();
    var r = constructor.apply(obj, argumentList);
    return r instanceof Object ? r : obj;
}
function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
    var argCount = argTypes.length;
    if (argCount < 2) {
        throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
    }
    var isClassMethodFunc = argTypes[1] !== null && classType !== null;
    var argsList = "";
    var argsListWired = "";
    for (var i = 0; i < argCount - 2; ++i) {
        argsList += (i !== 0 ? ", " : "") + "arg" + i;
        argsListWired += (i !== 0 ? ", " : "") + "arg" + i + "Wired";
    }
    var invokerFnBody =
        "return function " +
        makeLegalFunctionName(humanName) +
        "(" +
        argsList +
        ") {\n" +
        "if (arguments.length !== " +
        (argCount - 2) +
        ") {\n" +
        "throwBindingError('function " +
        humanName +
        " called with ' + arguments.length + ' arguments, expected " +
        (argCount - 2) +
        " args!');\n" +
        "}\n";
    var needsDestructorStack = false;
    for (var i = 1; i < argTypes.length; ++i) {
        if (argTypes[i] !== null && argTypes[i].destructorFunction === undefined) {
            needsDestructorStack = true;
            break;
        }
    }
    if (needsDestructorStack) {
        invokerFnBody += "var destructors = [];\n";
    }
    var dtorStack = needsDestructorStack ? "destructors" : "null";
    var args1 = ["throwBindingError", "invoker", "fn", "runDestructors", "retType", "classParam"];
    var args2 = [throwBindingError, cppInvokerFunc, cppTargetFunc, runDestructors, argTypes[0], argTypes[1]];
    if (isClassMethodFunc) {
        invokerFnBody += "var thisWired = classParam.toWireType(" + dtorStack + ", this);\n";
    }
    for (var i = 0; i < argCount - 2; ++i) {
        invokerFnBody += "var arg" + i + "Wired = argType" + i + ".toWireType(" + dtorStack + ", arg" + i + "); // " + argTypes[i + 2].name + "\n";
        args1.push("argType" + i);
        args2.push(argTypes[i + 2]);
    }
    if (isClassMethodFunc) {
        argsListWired = "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
    }
    var returns = argTypes[0].name !== "void";
    invokerFnBody += (returns ? "var rv = " : "") + "invoker(fn" + (argsListWired.length > 0 ? ", " : "") + argsListWired + ");\n";
    if (needsDestructorStack) {
        invokerFnBody += "runDestructors(destructors);\n";
    } else {
        for (var i = isClassMethodFunc ? 1 : 2; i < argTypes.length; ++i) {
            var paramName = i === 1 ? "thisWired" : "arg" + (i - 2) + "Wired";
            if (argTypes[i].destructorFunction !== null) {
                invokerFnBody += paramName + "_dtor(" + paramName + "); // " + argTypes[i].name + "\n";
                args1.push(paramName + "_dtor");
                args2.push(argTypes[i].destructorFunction);
            }
        }
    }
    if (returns) {
        invokerFnBody += "var ret = retType.fromWireType(rv);\n" + "return ret;\n";
    } else {
    }
    invokerFnBody += "}\n";
    args1.push(invokerFnBody);
    var invokerFunction = new_(Function, args1).apply(null, args2);
    return invokerFunction;
}
function heap32VectorToArray(count, firstElement) {
    var array = [];
    for (var i = 0; i < count; i++) {
        array.push(HEAP32[(firstElement >> 2) + i]);
    }
    return array;
}
function __embind_register_function(name, argCount, rawArgTypesAddr, signature, rawInvoker, fn) {
    var argTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
    name = readLatin1String(name);
    rawInvoker = requireFunction(signature, rawInvoker);
    exposePublicSymbol(
        name,
        function () {
            throwUnboundTypeError("Cannot call " + name + " due to unbound types", argTypes);
        },
        argCount - 1
    );
    whenDependentTypesAreResolved([], argTypes, function (argTypes) {
        var invokerArgsArray = [argTypes[0], null].concat(argTypes.slice(1));
        replacePublicSymbol(name, craftInvokerFunction(name, invokerArgsArray, null, rawInvoker, fn), argCount - 1);
        return [];
    });
}
function _emscripten_glDrawArraysInstanced(mode, first, count, primcount) {
    GL.currentContext.instancedArraysExt.drawArraysInstancedANGLE(mode, first, count, primcount);
}
function _emscripten_glDeleteBuffers(n, buffers) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(buffers + i * 4) >> 2];
        var buffer = GL.buffers[id];
        if (!buffer) continue;
        GLctx.deleteBuffer(buffer);
        buffer.name = 0;
        GL.buffers[id] = null;
        if (id == GL.currArrayBuffer) GL.currArrayBuffer = 0;
        if (id == GL.currElementArrayBuffer) GL.currElementArrayBuffer = 0;
    }
}
function _emscripten_glShaderBinary() {
    GL.recordError(1280);
}
function _emscripten_glIsProgram(program) {
    var program = GL.programs[program];
    if (!program) return 0;
    return GLctx.isProgram(program);
}
function _emscripten_glClear(x0) {
    GLctx.clear(x0);
}
function _emscripten_glUniformMatrix2fv(location, count, transpose, value) {
    location = GL.uniforms[location];
    var view;
    if (count === 1) {
        view = GL.miniTempBufferViews[3];
        for (var i = 0; i < 4; i++) {
            view[i] = HEAPF32[(value + i * 4) >> 2];
        }
    } else {
        view = HEAPF32.subarray(value >> 2, (value + count * 16) >> 2);
    }
    GLctx.uniformMatrix2fv(location, transpose, view);
}
function _emscripten_glBlendColor(x0, x1, x2, x3) {
    GLctx.blendColor(x0, x1, x2, x3);
}
function _emscripten_glGetShaderiv(shader, pname, p) {
    if (pname == 35716) {
        var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
        if (!log) log = "(unknown error)";
        HEAP32[p >> 2] = log.length + 1;
    } else {
        HEAP32[p >> 2] = GLctx.getShaderParameter(GL.shaders[shader], pname);
    }
}
function _emscripten_glUniformMatrix3fv(location, count, transpose, value) {
    location = GL.uniforms[location];
    var view;
    if (count === 1) {
        view = GL.miniTempBufferViews[8];
        for (var i = 0; i < 9; i++) {
            view[i] = HEAPF32[(value + i * 4) >> 2];
        }
    } else {
        view = HEAPF32.subarray(value >> 2, (value + count * 36) >> 2);
    }
    GLctx.uniformMatrix3fv(location, transpose, view);
}
function _emscripten_glVertexAttrib2f(x0, x1, x2) {
    GLctx.vertexAttrib2f(x0, x1, x2);
}
function _emscripten_glUniform4fv(location, count, value) {
    location = GL.uniforms[location];
    var view;
    if (count === 1) {
        view = GL.miniTempBufferViews[3];
        view[0] = HEAPF32[value >> 2];
        view[1] = HEAPF32[(value + 4) >> 2];
        view[2] = HEAPF32[(value + 8) >> 2];
        view[3] = HEAPF32[(value + 12) >> 2];
    } else {
        view = HEAPF32.subarray(value >> 2, (value + count * 16) >> 2);
    }
    GLctx.uniform4fv(location, view);
}
function _emscripten_glGetVertexAttribiv(index, pname, params) {
    var data = GLctx.getVertexAttrib(index, pname);
    if (typeof data == "number" || typeof data == "boolean") {
        HEAP32[params >> 2] = data;
    } else {
        for (var i = 0; i < data.length; i++) {
            HEAP32[(params + i) >> 2] = data[i];
        }
    }
}
function _emscripten_glUniformMatrix4fv(location, count, transpose, value) {
    location = GL.uniforms[location];
    var view;
    if (count === 1) {
        view = GL.miniTempBufferViews[15];
        for (var i = 0; i < 16; i++) {
            view[i] = HEAPF32[(value + i * 4) >> 2];
        }
    } else {
        view = HEAPF32.subarray(value >> 2, (value + count * 64) >> 2);
    }
    GLctx.uniformMatrix4fv(location, transpose, view);
}
function _emscripten_glGenFramebuffers(n, ids) {
    for (var i = 0; i < n; ++i) {
        var id = GL.getNewId(GL.framebuffers);
        var framebuffer = GLctx.createFramebuffer();
        framebuffer.name = id;
        GL.framebuffers[id] = framebuffer;
        HEAP32[(ids + i * 4) >> 2] = id;
    }
}
Module["_strcpy"] = _strcpy;
function _emscripten_glEnableClientState() {
    Module["printErr"]("missing function: emscripten_glEnableClientState");
    abort(-1);
}
function __embind_register_class_constructor(rawClassType, argCount, rawArgTypesAddr, invokerSignature, invoker, rawConstructor) {
    var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
    invoker = requireFunction(invokerSignature, invoker);
    whenDependentTypesAreResolved([], [rawClassType], function (classType) {
        classType = classType[0];
        var humanName = "constructor " + classType.name;
        if (undefined === classType.registeredClass.constructor_body) {
            classType.registeredClass.constructor_body = [];
        }
        if (undefined !== classType.registeredClass.constructor_body[argCount - 1]) {
            throw new BindingError(
                "Cannot register multiple constructors with identical number of parameters (" +
                    (argCount - 1) +
                    ") for class '" +
                    classType.name +
                    "'! Overload resolution is currently only performed using the parameter count, not actual type info!"
            );
        }
        classType.registeredClass.constructor_body[argCount - 1] = function unboundTypeHandler() {
            throwUnboundTypeError("Cannot construct " + classType.name + " due to unbound types", rawArgTypes);
        };
        whenDependentTypesAreResolved([], rawArgTypes, function (argTypes) {
            classType.registeredClass.constructor_body[argCount - 1] = function constructor_body() {
                if (arguments.length !== argCount - 1) {
                    throwBindingError(humanName + " called with " + arguments.length + " arguments, expected " + (argCount - 1));
                }
                var destructors = [];
                var args = new Array(argCount);
                args[0] = rawConstructor;
                for (var i = 1; i < argCount; ++i) {
                    args[i] = argTypes[i]["toWireType"](destructors, arguments[i - 1]);
                }
                var ptr = invoker.apply(null, args);
                runDestructors(destructors);
                return argTypes[0]["fromWireType"](ptr);
            };
            return [];
        });
        return [];
    });
}
function _emscripten_glShaderSource(shader, count, string, length) {
    var source = GL.getSource(shader, count, string, length);
    GLctx.shaderSource(GL.shaders[shader], source);
}
function _emscripten_glBlendEquationSeparate(x0, x1) {
    GLctx.blendEquationSeparate(x0, x1);
}
function _emscripten_glBindTexture(target, texture) {
    GLctx.bindTexture(target, texture ? GL.textures[texture] : null);
}
function __embind_register_class_function(rawClassType, methodName, argCount, rawArgTypesAddr, invokerSignature, rawInvoker, context, isPureVirtual) {
    var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
    methodName = readLatin1String(methodName);
    rawInvoker = requireFunction(invokerSignature, rawInvoker);
    whenDependentTypesAreResolved([], [rawClassType], function (classType) {
        classType = classType[0];
        var humanName = classType.name + "." + methodName;
        if (isPureVirtual) {
            classType.registeredClass.pureVirtualFunctions.push(methodName);
        }
        function unboundTypesHandler() {
            throwUnboundTypeError("Cannot call " + humanName + " due to unbound types", rawArgTypes);
        }
        var proto = classType.registeredClass.instancePrototype;
        var method = proto[methodName];
        if (undefined === method || (undefined === method.overloadTable && method.className !== classType.name && method.argCount === argCount - 2)) {
            unboundTypesHandler.argCount = argCount - 2;
            unboundTypesHandler.className = classType.name;
            proto[methodName] = unboundTypesHandler;
        } else {
            ensureOverloadTable(proto, methodName, humanName);
            proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
        }
        whenDependentTypesAreResolved([], rawArgTypes, function (argTypes) {
            var memberFunction = craftInvokerFunction(humanName, argTypes, classType, rawInvoker, context);
            if (undefined === proto[methodName].overloadTable) {
                proto[methodName] = memberFunction;
            } else {
                proto[methodName].overloadTable[argCount - 2] = memberFunction;
            }
            return [];
        });
        return [];
    });
}
function _emscripten_glStencilMask(x0) {
    GLctx.stencilMask(x0);
}
function _emscripten_glStencilFuncSeparate(x0, x1, x2, x3) {
    GLctx.stencilFuncSeparate(x0, x1, x2, x3);
}
function _emscripten_glGenTextures(n, textures) {
    for (var i = 0; i < n; i++) {
        var id = GL.getNewId(GL.textures);
        var texture = GLctx.createTexture();
        texture.name = id;
        GL.textures[id] = texture;
        HEAP32[(textures + i * 4) >> 2] = id;
    }
}
function _emscripten_glVertexAttrib2fv(index, v) {
    v = HEAPF32.subarray(v >> 2, (v + 8) >> 2);
    GLctx.vertexAttrib2fv(index, v);
}
Module["_i64Add"] = _i64Add;
function _emscripten_glGetActiveUniform(program, index, bufSize, length, size, type, name) {
    program = GL.programs[program];
    var info = GLctx.getActiveUniform(program, index);
    if (!info) return;
    var infoname = info.name.slice(0, Math.max(0, bufSize - 1));
    if (bufSize > 0 && name) {
        writeStringToMemory(infoname, name);
        if (length) HEAP32[length >> 2] = infoname.length;
    } else {
        if (length) HEAP32[length >> 2] = 0;
    }
    if (size) HEAP32[size >> 2] = info.size;
    if (type) HEAP32[type >> 2] = info.type;
}
function _emscripten_glDeleteObjectARB() {
    Module["printErr"]("missing function: emscripten_glDeleteObjectARB");
    abort(-1);
}
function __ZSt18uncaught_exceptionv() {
    return !!__ZSt18uncaught_exceptionv.uncaught_exception;
}
var EXCEPTIONS = {
    last: 0,
    caught: [],
    infos: {},
    deAdjust: function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
            var info = EXCEPTIONS.infos[ptr];
            if (info.adjusted === adjusted) {
                return ptr;
            }
        }
        return adjusted;
    },
    addRef: function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
    },
    decRef: function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        if (info.refcount === 0) {
            if (info.destructor) {
                Runtime.dynCall("vi", info.destructor, [ptr]);
            }
            delete EXCEPTIONS.infos[ptr];
            ___cxa_free_exception(ptr);
        }
    },
    clearRef: function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
    },
};
function ___resumeException(ptr) {
    if (!EXCEPTIONS.last) {
        EXCEPTIONS.last = ptr;
    }
    EXCEPTIONS.clearRef(EXCEPTIONS.deAdjust(ptr));
    throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
}
function ___cxa_find_matching_catch() {
    var thrown = EXCEPTIONS.last;
    if (!thrown) {
        return (asm["setTempRet0"](0), 0) | 0;
    }
    var info = EXCEPTIONS.infos[thrown];
    var throwntype = info.type;
    if (!throwntype) {
        return (asm["setTempRet0"](0), thrown) | 0;
    }
    var typeArray = Array.prototype.slice.call(arguments);
    var pointer = Module["___cxa_is_pointer_type"](throwntype);
    if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
    HEAP32[___cxa_find_matching_catch.buffer >> 2] = thrown;
    thrown = ___cxa_find_matching_catch.buffer;
    for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module["___cxa_can_catch"](typeArray[i], throwntype, thrown)) {
            thrown = HEAP32[thrown >> 2];
            info.adjusted = thrown;
            return (asm["setTempRet0"](typeArray[i]), thrown) | 0;
        }
    }
    thrown = HEAP32[thrown >> 2];
    return (asm["setTempRet0"](throwntype), thrown) | 0;
}
function ___cxa_throw(ptr, type, destructor) {
    EXCEPTIONS.infos[ptr] = { ptr: ptr, adjusted: ptr, type: type, destructor: destructor, refcount: 0 };
    EXCEPTIONS.last = ptr;
    if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
    } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
    }
    throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
}
function ___cxa_begin_catch(ptr) {
    __ZSt18uncaught_exceptionv.uncaught_exception--;
    EXCEPTIONS.caught.push(ptr);
    EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
    return ptr;
}
function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
    var shift = getShiftFromSize(size);
    name = readLatin1String(name);
    registerType(rawType, {
        name: name,
        fromWireType: function (wt) {
            return !!wt;
        },
        toWireType: function (destructors, o) {
            return o ? trueValue : falseValue;
        },
        argPackAdvance: 8,
        readValueFromPointer: function (pointer) {
            var heap;
            if (size === 1) {
                heap = HEAP8;
            } else if (size === 2) {
                heap = HEAP16;
            } else if (size === 4) {
                heap = HEAP32;
            } else {
                throw new TypeError("Unknown boolean type size: " + name);
            }
            return this["fromWireType"](heap[pointer >> shift]);
        },
        destructorFunction: null,
    });
}
function _emscripten_glUniform1f(location, v0) {
    location = GL.uniforms[location];
    GLctx.uniform1f(location, v0);
}
function _emscripten_glDisableVertexAttribArray(index) {
    GLctx.disableVertexAttribArray(index);
}
function _emscripten_glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
    GLctx.vertexAttribPointer(index, size, type, normalized, stride, ptr);
}
function integerReadValueFromPointer(name, shift, signed) {
    switch (shift) {
        case 0:
            return signed
                ? function readS8FromPointer(pointer) {
                      return HEAP8[pointer];
                  }
                : function readU8FromPointer(pointer) {
                      return HEAPU8[pointer];
                  };
        case 1:
            return signed
                ? function readS16FromPointer(pointer) {
                      return HEAP16[pointer >> 1];
                  }
                : function readU16FromPointer(pointer) {
                      return HEAPU16[pointer >> 1];
                  };
        case 2:
            return signed
                ? function readS32FromPointer(pointer) {
                      return HEAP32[pointer >> 2];
                  }
                : function readU32FromPointer(pointer) {
                      return HEAPU32[pointer >> 2];
                  };
        default:
            throw new TypeError("Unknown integer type: " + name);
    }
}
function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
    name = readLatin1String(name);
    if (maxRange === -1) {
        maxRange = 4294967295;
    }
    var shift = getShiftFromSize(size);
    registerType(primitiveType, {
        name: name,
        fromWireType: function (value) {
            return value;
        },
        toWireType: function (destructors, value) {
            if (typeof value !== "number" && typeof value !== "boolean") {
                throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
            }
            if (value < minRange || value > maxRange) {
                throw new TypeError('Passing a number "' + _embind_repr(value) + '" from JS side to C/C++ side to an argument of type "' + name + '", which is outside the valid range [' + minRange + ", " + maxRange + "]!");
            }
            return value | 0;
        },
        argPackAdvance: 8,
        readValueFromPointer: integerReadValueFromPointer(name, shift, minRange !== 0),
        destructorFunction: null,
    });
}
function _emscripten_glVertexAttrib1f(x0, x1) {
    GLctx.vertexAttrib1f(x0, x1);
}
function _emscripten_glFinish() {
    GLctx.finish();
}
function _emscripten_glDepthFunc(x0) {
    GLctx.depthFunc(x0);
}
function _emscripten_glDrawArrays(mode, first, count) {
    GLctx.drawArrays(mode, first, count);
}
function _emscripten_glGenBuffers(n, buffers) {
    for (var i = 0; i < n; i++) {
        var id = GL.getNewId(GL.buffers);
        var buffer = GLctx.createBuffer();
        buffer.name = id;
        GL.buffers[id] = buffer;
        HEAP32[(buffers + i * 4) >> 2] = id;
    }
}
function _sysconf(name) {
    switch (name) {
        case 30:
            return PAGE_SIZE;
        case 132:
        case 133:
        case 12:
        case 137:
        case 138:
        case 15:
        case 235:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20:
        case 149:
        case 13:
        case 10:
        case 236:
        case 153:
        case 9:
        case 21:
        case 22:
        case 159:
        case 154:
        case 14:
        case 77:
        case 78:
        case 139:
        case 80:
        case 81:
        case 79:
        case 82:
        case 68:
        case 67:
        case 164:
        case 11:
        case 29:
        case 47:
        case 48:
        case 95:
        case 52:
        case 51:
        case 46:
            return 200809;
        case 27:
        case 246:
        case 127:
        case 128:
        case 23:
        case 24:
        case 160:
        case 161:
        case 181:
        case 182:
        case 242:
        case 183:
        case 184:
        case 243:
        case 244:
        case 245:
        case 165:
        case 178:
        case 179:
        case 49:
        case 50:
        case 168:
        case 169:
        case 175:
        case 170:
        case 171:
        case 172:
        case 97:
        case 76:
        case 32:
        case 173:
        case 35:
            return -1;
        case 176:
        case 177:
        case 7:
        case 155:
        case 8:
        case 157:
        case 125:
        case 126:
        case 92:
        case 93:
        case 129:
        case 130:
        case 131:
        case 94:
        case 91:
            return 1;
        case 74:
        case 60:
        case 69:
        case 70:
        case 4:
            return 1024;
        case 31:
        case 42:
        case 72:
            return 32;
        case 87:
        case 26:
        case 33:
            return 2147483647;
        case 34:
        case 1:
            return 47839;
        case 38:
        case 36:
            return 99;
        case 43:
        case 37:
            return 2048;
        case 0:
            return 2097152;
        case 3:
            return 65536;
        case 28:
            return 32768;
        case 44:
            return 32767;
        case 75:
            return 16384;
        case 39:
            return 1e3;
        case 89:
            return 700;
        case 71:
            return 256;
        case 40:
            return 255;
        case 2:
            return 100;
        case 180:
            return 64;
        case 25:
            return 20;
        case 5:
            return 16;
        case 6:
            return 6;
        case 73:
            return 4;
        case 84: {
            if (typeof navigator === "object") return navigator["hardwareConcurrency"] || 1;
            return 1;
        }
    }
    ___setErrNo(ERRNO_CODES.EINVAL);
    return -1;
}
var PTHREAD_SPECIFIC_NEXT_KEY = 1;
function _pthread_key_create(key, destructor) {
    if (key == 0) {
        return ERRNO_CODES.EINVAL;
    }
    HEAP32[key >> 2] = PTHREAD_SPECIFIC_NEXT_KEY;
    PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
    PTHREAD_SPECIFIC_NEXT_KEY++;
    return 0;
}
function _emscripten_glUniform4iv(location, count, value) {
    location = GL.uniforms[location];
    count *= 4;
    value = HEAP32.subarray(value >> 2, (value + count * 4) >> 2);
    GLctx.uniform4iv(location, value);
}
function _emscripten_glLoadIdentity() {
    throw "Legacy GL function (glLoadIdentity) called. If you want legacy GL emulation, you need to compile with -s LEGACY_GL_EMULATION=1 to enable legacy GL emulation.";
}
function _emscripten_glUniform3fv(location, count, value) {
    location = GL.uniforms[location];
    var view;
    if (count === 1) {
        view = GL.miniTempBufferViews[2];
        view[0] = HEAPF32[value >> 2];
        view[1] = HEAPF32[(value + 4) >> 2];
        view[2] = HEAPF32[(value + 8) >> 2];
    } else {
        view = HEAPF32.subarray(value >> 2, (value + count * 12) >> 2);
    }
    GLctx.uniform3fv(location, view);
}
function _emscripten_glGetUniformLocation(program, name) {
    name = Pointer_stringify(name);
    var arrayOffset = 0;
    if (name.indexOf("]", name.length - 1) !== -1) {
        var ls = name.lastIndexOf("[");
        var arrayIndex = name.slice(ls + 1, -1);
        if (arrayIndex.length > 0) {
            arrayOffset = parseInt(arrayIndex);
            if (arrayOffset < 0) {
                return -1;
            }
        }
        name = name.slice(0, ls);
    }
    var ptable = GL.programInfos[program];
    if (!ptable) {
        return -1;
    }
    var utable = ptable.uniforms;
    var uniformInfo = utable[name];
    if (uniformInfo && arrayOffset < uniformInfo[0]) {
        return uniformInfo[1] + arrayOffset;
    } else {
        return -1;
    }
}
function _emscripten_glAttachShader(program, shader) {
    GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
}
function _emscripten_glVertexAttrib4fv(index, v) {
    v = HEAPF32.subarray(v >> 2, (v + 16) >> 2);
    GLctx.vertexAttrib4fv(index, v);
}
function _emscripten_glScissor(x0, x1, x2, x3) {
    GLctx.scissor(x0, x1, x2, x3);
}
Module["_bitshift64Lshr"] = _bitshift64Lshr;
function _emscripten_glColorPointer() {
    Module["printErr"]("missing function: emscripten_glColorPointer");
    abort(-1);
}
function _emscripten_glIsShader(shader) {
    var s = GL.shaders[shader];
    if (!s) return 0;
    return GLctx.isShader(s);
}
function _emscripten_glDrawBuffers(n, bufs) {
    var bufArray = [];
    for (var i = 0; i < n; i++) bufArray.push(HEAP32[(bufs + i * 4) >> 2]);
    GL.currentContext.drawBuffersExt(bufArray);
}
function _emscripten_glClearStencil(x0) {
    GLctx.clearStencil(x0);
}
Module["_strlen"] = _strlen;
function __reallyNegative(x) {
    return x < 0 || (x === 0 && 1 / x === -Infinity);
}
function __formatString(format, varargs) {
    var textIndex = format;
    var argIndex = 0;
    function getNextArg(type) {
        var ret;
        if (type === "double") {
            ret = ((HEAP32[tempDoublePtr >> 2] = HEAP32[(varargs + argIndex) >> 2]), (HEAP32[(tempDoublePtr + 4) >> 2] = HEAP32[(varargs + (argIndex + 4)) >> 2]), +HEAPF64[tempDoublePtr >> 3]);
        } else if (type == "i64") {
            ret = [HEAP32[(varargs + argIndex) >> 2], HEAP32[(varargs + (argIndex + 4)) >> 2]];
        } else {
            type = "i32";
            ret = HEAP32[(varargs + argIndex) >> 2];
        }
        argIndex += Runtime.getNativeFieldSize(type);
        return ret;
    }
    var ret = [];
    var curr, next, currArg;
    while (1) {
        var startTextIndex = textIndex;
        curr = HEAP8[textIndex >> 0];
        if (curr === 0) break;
        next = HEAP8[(textIndex + 1) >> 0];
        if (curr == 37) {
            var flagAlwaysSigned = false;
            var flagLeftAlign = false;
            var flagAlternative = false;
            var flagZeroPad = false;
            var flagPadSign = false;
            flagsLoop: while (1) {
                switch (next) {
                    case 43:
                        flagAlwaysSigned = true;
                        break;
                    case 45:
                        flagLeftAlign = true;
                        break;
                    case 35:
                        flagAlternative = true;
                        break;
                    case 48:
                        if (flagZeroPad) {
                            break flagsLoop;
                        } else {
                            flagZeroPad = true;
                            break;
                        }
                    case 32:
                        flagPadSign = true;
                        break;
                    default:
                        break flagsLoop;
                }
                textIndex++;
                next = HEAP8[(textIndex + 1) >> 0];
            }
            var width = 0;
            if (next == 42) {
                width = getNextArg("i32");
                textIndex++;
                next = HEAP8[(textIndex + 1) >> 0];
            } else {
                while (next >= 48 && next <= 57) {
                    width = width * 10 + (next - 48);
                    textIndex++;
                    next = HEAP8[(textIndex + 1) >> 0];
                }
            }
            var precisionSet = false,
                precision = -1;
            if (next == 46) {
                precision = 0;
                precisionSet = true;
                textIndex++;
                next = HEAP8[(textIndex + 1) >> 0];
                if (next == 42) {
                    precision = getNextArg("i32");
                    textIndex++;
                } else {
                    while (1) {
                        var precisionChr = HEAP8[(textIndex + 1) >> 0];
                        if (precisionChr < 48 || precisionChr > 57) break;
                        precision = precision * 10 + (precisionChr - 48);
                        textIndex++;
                    }
                }
                next = HEAP8[(textIndex + 1) >> 0];
            }
            if (precision < 0) {
                precision = 6;
                precisionSet = false;
            }
            var argSize;
            switch (String.fromCharCode(next)) {
                case "h":
                    var nextNext = HEAP8[(textIndex + 2) >> 0];
                    if (nextNext == 104) {
                        textIndex++;
                        argSize = 1;
                    } else {
                        argSize = 2;
                    }
                    break;
                case "l":
                    var nextNext = HEAP8[(textIndex + 2) >> 0];
                    if (nextNext == 108) {
                        textIndex++;
                        argSize = 8;
                    } else {
                        argSize = 4;
                    }
                    break;
                case "L":
                case "q":
                case "j":
                    argSize = 8;
                    break;
                case "z":
                case "t":
                case "I":
                    argSize = 4;
                    break;
                default:
                    argSize = null;
            }
            if (argSize) textIndex++;
            next = HEAP8[(textIndex + 1) >> 0];
            switch (String.fromCharCode(next)) {
                case "d":
                case "i":
                case "u":
                case "o":
                case "x":
                case "X":
                case "p": {
                    var signed = next == 100 || next == 105;
                    argSize = argSize || 4;
                    var currArg = getNextArg("i" + argSize * 8);
                    var origArg = currArg;
                    var argText;
                    if (argSize == 8) {
                        currArg = Runtime.makeBigInt(currArg[0], currArg[1], next == 117);
                    }
                    if (argSize <= 4) {
                        var limit = Math.pow(256, argSize) - 1;
                        currArg = (signed ? reSign : unSign)(currArg & limit, argSize * 8);
                    }
                    var currAbsArg = Math.abs(currArg);
                    var prefix = "";
                    if (next == 100 || next == 105) {
                        if (argSize == 8 && i64Math) argText = i64Math.stringify(origArg[0], origArg[1], null);
                        else argText = reSign(currArg, 8 * argSize, 1).toString(10);
                    } else if (next == 117) {
                        if (argSize == 8 && i64Math) argText = i64Math.stringify(origArg[0], origArg[1], true);
                        else argText = unSign(currArg, 8 * argSize, 1).toString(10);
                        currArg = Math.abs(currArg);
                    } else if (next == 111) {
                        argText = (flagAlternative ? "0" : "") + currAbsArg.toString(8);
                    } else if (next == 120 || next == 88) {
                        prefix = flagAlternative && currArg != 0 ? "0x" : "";
                        if (argSize == 8 && i64Math) {
                            if (origArg[1]) {
                                argText = (origArg[1] >>> 0).toString(16);
                                var lower = (origArg[0] >>> 0).toString(16);
                                while (lower.length < 8) lower = "0" + lower;
                                argText += lower;
                            } else {
                                argText = (origArg[0] >>> 0).toString(16);
                            }
                        } else if (currArg < 0) {
                            currArg = -currArg;
                            argText = (currAbsArg - 1).toString(16);
                            var buffer = [];
                            for (var i = 0; i < argText.length; i++) {
                                buffer.push((15 - parseInt(argText[i], 16)).toString(16));
                            }
                            argText = buffer.join("");
                            while (argText.length < argSize * 2) argText = "f" + argText;
                        } else {
                            argText = currAbsArg.toString(16);
                        }
                        if (next == 88) {
                            prefix = prefix.toUpperCase();
                            argText = argText.toUpperCase();
                        }
                    } else if (next == 112) {
                        if (currAbsArg === 0) {
                            argText = "(nil)";
                        } else {
                            prefix = "0x";
                            argText = currAbsArg.toString(16);
                        }
                    }
                    if (precisionSet) {
                        while (argText.length < precision) {
                            argText = "0" + argText;
                        }
                    }
                    if (currArg >= 0) {
                        if (flagAlwaysSigned) {
                            prefix = "+" + prefix;
                        } else if (flagPadSign) {
                            prefix = " " + prefix;
                        }
                    }
                    if (argText.charAt(0) == "-") {
                        prefix = "-" + prefix;
                        argText = argText.substr(1);
                    }
                    while (prefix.length + argText.length < width) {
                        if (flagLeftAlign) {
                            argText += " ";
                        } else {
                            if (flagZeroPad) {
                                argText = "0" + argText;
                            } else {
                                prefix = " " + prefix;
                            }
                        }
                    }
                    argText = prefix + argText;
                    argText.split("").forEach(function (chr) {
                        ret.push(chr.charCodeAt(0));
                    });
                    break;
                }
                case "f":
                case "F":
                case "e":
                case "E":
                case "g":
                case "G": {
                    var currArg = getNextArg("double");
                    var argText;
                    if (isNaN(currArg)) {
                        argText = "nan";
                        flagZeroPad = false;
                    } else if (!isFinite(currArg)) {
                        argText = (currArg < 0 ? "-" : "") + "inf";
                        flagZeroPad = false;
                    } else {
                        var isGeneral = false;
                        var effectivePrecision = Math.min(precision, 20);
                        if (next == 103 || next == 71) {
                            isGeneral = true;
                            precision = precision || 1;
                            var exponent = parseInt(currArg.toExponential(effectivePrecision).split("e")[1], 10);
                            if (precision > exponent && exponent >= -4) {
                                next = (next == 103 ? "f" : "F").charCodeAt(0);
                                precision -= exponent + 1;
                            } else {
                                next = (next == 103 ? "e" : "E").charCodeAt(0);
                                precision--;
                            }
                            effectivePrecision = Math.min(precision, 20);
                        }
                        if (next == 101 || next == 69) {
                            argText = currArg.toExponential(effectivePrecision);
                            if (/[eE][-+]\d$/.test(argText)) {
                                argText = argText.slice(0, -1) + "0" + argText.slice(-1);
                            }
                        } else if (next == 102 || next == 70) {
                            argText = currArg.toFixed(effectivePrecision);
                            if (currArg === 0 && __reallyNegative(currArg)) {
                                argText = "-" + argText;
                            }
                        }
                        var parts = argText.split("e");
                        if (isGeneral && !flagAlternative) {
                            while (parts[0].length > 1 && parts[0].indexOf(".") != -1 && (parts[0].slice(-1) == "0" || parts[0].slice(-1) == ".")) {
                                parts[0] = parts[0].slice(0, -1);
                            }
                        } else {
                            if (flagAlternative && argText.indexOf(".") == -1) parts[0] += ".";
                            while (precision > effectivePrecision++) parts[0] += "0";
                        }
                        argText = parts[0] + (parts.length > 1 ? "e" + parts[1] : "");
                        if (next == 69) argText = argText.toUpperCase();
                        if (currArg >= 0) {
                            if (flagAlwaysSigned) {
                                argText = "+" + argText;
                            } else if (flagPadSign) {
                                argText = " " + argText;
                            }
                        }
                    }
                    while (argText.length < width) {
                        if (flagLeftAlign) {
                            argText += " ";
                        } else {
                            if (flagZeroPad && (argText[0] == "-" || argText[0] == "+")) {
                                argText = argText[0] + "0" + argText.slice(1);
                            } else {
                                argText = (flagZeroPad ? "0" : " ") + argText;
                            }
                        }
                    }
                    if (next < 97) argText = argText.toUpperCase();
                    argText.split("").forEach(function (chr) {
                        ret.push(chr.charCodeAt(0));
                    });
                    break;
                }
                case "s": {
                    var arg = getNextArg("i8*");
                    var argLength = arg ? _strlen(arg) : "(null)".length;
                    if (precisionSet) argLength = Math.min(argLength, precision);
                    if (!flagLeftAlign) {
                        while (argLength < width--) {
                            ret.push(32);
                        }
                    }
                    if (arg) {
                        for (var i = 0; i < argLength; i++) {
                            ret.push(HEAPU8[arg++ >> 0]);
                        }
                    } else {
                        ret = ret.concat(intArrayFromString("(null)".substr(0, argLength), true));
                    }
                    if (flagLeftAlign) {
                        while (argLength < width--) {
                            ret.push(32);
                        }
                    }
                    break;
                }
                case "c": {
                    if (flagLeftAlign) ret.push(getNextArg("i8"));
                    while (--width > 0) {
                        ret.push(32);
                    }
                    if (!flagLeftAlign) ret.push(getNextArg("i8"));
                    break;
                }
                case "n": {
                    var ptr = getNextArg("i32*");
                    HEAP32[ptr >> 2] = ret.length;
                    break;
                }
                case "%": {
                    ret.push(curr);
                    break;
                }
                default: {
                    for (var i = startTextIndex; i < textIndex + 2; i++) {
                        ret.push(HEAP8[i >> 0]);
                    }
                }
            }
            textIndex += 2;
        } else {
            ret.push(curr);
            textIndex += 1;
        }
    }
    return ret;
}
function _fprintf(stream, format, varargs) {
    var result = __formatString(format, varargs);
    var stack = Runtime.stackSave();
    var ret = _fwrite(allocate(result, "i8", ALLOC_STACK), 1, result.length, stream);
    Runtime.stackRestore(stack);
    return ret;
}
function _vfprintf(s, f, va_arg) {
    return _fprintf(s, f, HEAP32[va_arg >> 2]);
}
function _emscripten_glBindFramebuffer(target, framebuffer) {
    GLctx.bindFramebuffer(target, framebuffer ? GL.framebuffers[framebuffer] : null);
}
function _emscripten_glDetachShader(program, shader) {
    GLctx.detachShader(GL.programs[program], GL.shaders[shader]);
}
function _emscripten_glBlendEquation(x0) {
    GLctx.blendEquation(x0);
}
function _emscripten_glBufferSubData(target, offset, size, data) {
    GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data + size));
}
function _emscripten_glBufferData(target, size, data, usage) {
    switch (usage) {
        case 35041:
        case 35042:
            usage = 35040;
            break;
        case 35045:
        case 35046:
            usage = 35044;
            break;
        case 35049:
        case 35050:
            usage = 35048;
            break;
    }
    if (!data) {
        GLctx.bufferData(target, size, usage);
    } else {
        GLctx.bufferData(target, HEAPU8.subarray(data, data + size), usage);
    }
}
function _sbrk(bytes) {
    var self = _sbrk;
    if (!self.called) {
        DYNAMICTOP = alignMemoryPage(DYNAMICTOP);
        self.called = true;
        assert(Runtime.dynamicAlloc);
        self.alloc = Runtime.dynamicAlloc;
        Runtime.dynamicAlloc = function () {
            abort("cannot dynamically allocate, sbrk now has control");
        };
    }
    var ret = DYNAMICTOP;
    if (bytes != 0) self.alloc(bytes);
    return ret;
}
function ___errno_location() {
    return ___errno_state;
}
function _emscripten_glGetTexParameteriv(target, pname, params) {
    HEAP32[params >> 2] = GLctx.getTexParameter(target, pname);
}
function _emscripten_glGetShaderSource(shader, bufSize, length, source) {
    var result = GLctx.getShaderSource(GL.shaders[shader]);
    if (!result) return;
    result = result.slice(0, Math.max(0, bufSize - 1));
    if (bufSize > 0 && source) {
        writeStringToMemory(result, source);
        if (length) HEAP32[length >> 2] = result.length;
    } else {
        if (length) HEAP32[length >> 2] = 0;
    }
}
function _emscripten_glClearDepth(x0) {
    GLctx.clearDepth(x0);
}
function validateThis(this_, classType, humanName) {
    if (!(this_ instanceof Object)) {
        throwBindingError(humanName + ' with invalid "this": ' + this_);
    }
    if (!(this_ instanceof classType.registeredClass.constructor)) {
        throwBindingError(humanName + ' incompatible with "this" of type ' + this_.constructor.name);
    }
    if (!this_.$$.ptr) {
        throwBindingError("cannot call emscripten binding method " + humanName + " on deleted object");
    }
    return upcastPointer(this_.$$.ptr, this_.$$.ptrType.registeredClass, classType.registeredClass);
}
function __embind_register_class_property(classType, fieldName, getterReturnType, getterSignature, getter, getterContext, setterArgumentType, setterSignature, setter, setterContext) {
    fieldName = readLatin1String(fieldName);
    getter = requireFunction(getterSignature, getter);
    whenDependentTypesAreResolved([], [classType], function (classType) {
        classType = classType[0];
        var humanName = classType.name + "." + fieldName;
        var desc = {
            get: function () {
                throwUnboundTypeError("Cannot access " + humanName + " due to unbound types", [getterReturnType, setterArgumentType]);
            },
            enumerable: true,
            configurable: true,
        };
        if (setter) {
            desc.set = function () {
                throwUnboundTypeError("Cannot access " + humanName + " due to unbound types", [getterReturnType, setterArgumentType]);
            };
        } else {
            desc.set = function (v) {
                throwBindingError(humanName + " is a read-only property");
            };
        }
        Object.defineProperty(classType.registeredClass.instancePrototype, fieldName, desc);
        whenDependentTypesAreResolved([], setter ? [getterReturnType, setterArgumentType] : [getterReturnType], function (types) {
            var getterReturnType = types[0];
            var desc = {
                get: function () {
                    var ptr = validateThis(this, classType, humanName + " getter");
                    return getterReturnType["fromWireType"](getter(getterContext, ptr));
                },
                enumerable: true,
            };
            if (setter) {
                setter = requireFunction(setterSignature, setter);
                var setterArgumentType = types[1];
                desc.set = function (v) {
                    var ptr = validateThis(this, classType, humanName + " setter");
                    var destructors = [];
                    setter(setterContext, ptr, setterArgumentType["toWireType"](destructors, v));
                    runDestructors(destructors);
                };
            }
            Object.defineProperty(classType.registeredClass.instancePrototype, fieldName, desc);
            return [];
        });
        return [];
    });
}
function _emscripten_glGenerateMipmap(x0) {
    GLctx.generateMipmap(x0);
}
function _emscripten_glSampleCoverage(x0, x1) {
    GLctx.sampleCoverage(x0, x1);
}
function _emscripten_glCullFace(x0) {
    GLctx.cullFace(x0);
}
function __embind_register_value_object(rawType, name, constructorSignature, rawConstructor, destructorSignature, rawDestructor) {
    structRegistrations[rawType] = { name: readLatin1String(name), rawConstructor: requireFunction(constructorSignature, rawConstructor), rawDestructor: requireFunction(destructorSignature, rawDestructor), fields: [] };
}
function _emscripten_glGetFloatv(name_, p) {
    return GL.get(name_, p, "Float");
}
function _emscripten_glUseProgram(program) {
    GLctx.useProgram(program ? GL.programs[program] : null);
}
function _emscripten_glHint(x0, x1) {
    GLctx.hint(x0, x1);
}
function _emscripten_glVertexAttribDivisor(index, divisor) {
    GL.currentContext.instancedArraysExt.vertexAttribDivisorANGLE(index, divisor);
}
function _emscripten_glDrawElementsInstanced(mode, count, type, indices, primcount) {
    GL.currentContext.instancedArraysExt.drawElementsInstancedANGLE(mode, count, type, indices, primcount);
}
function _recv(fd, buf, len, flags) {
    var sock = SOCKFS.getSocket(fd);
    if (!sock) {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
    }
    return _read(fd, buf, len);
}
function _pread(fildes, buf, nbyte, offset) {
    var stream = FS.getStream(fildes);
    if (!stream) {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
    }
    try {
        var slab = HEAP8;
        return FS.read(stream, slab, buf, nbyte, offset);
    } catch (e) {
        FS.handleFSError(e);
        return -1;
    }
}
function _read(fildes, buf, nbyte) {
    var stream = FS.getStream(fildes);
    if (!stream) {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
    }
    try {
        var slab = HEAP8;
        return FS.read(stream, slab, buf, nbyte);
    } catch (e) {
        FS.handleFSError(e);
        return -1;
    }
}
function _fread(ptr, size, nitems, stream) {
    var bytesToRead = nitems * size;
    if (bytesToRead == 0) {
        return 0;
    }
    var bytesRead = 0;
    var streamObj = FS.getStreamFromPtr(stream);
    if (!streamObj) {
        ___setErrNo(ERRNO_CODES.EBADF);
        return 0;
    }
    while (streamObj.ungotten.length && bytesToRead > 0) {
        HEAP8[ptr++ >> 0] = streamObj.ungotten.pop();
        bytesToRead--;
        bytesRead++;
    }
    var err = _read(streamObj.fd, ptr, bytesToRead);
    if (err == -1) {
        if (streamObj) streamObj.error = true;
        return 0;
    }
    bytesRead += err;
    if (bytesRead < bytesToRead) streamObj.eof = true;
    return (bytesRead / size) | 0;
}
function _emscripten_glDrawElements(mode, count, type, indices) {
    GLctx.drawElements(mode, count, type, indices);
}
function _emscripten_glUniform2fv(location, count, value) {
    location = GL.uniforms[location];
    var view;
    if (count === 1) {
        view = GL.miniTempBufferViews[1];
        view[0] = HEAPF32[value >> 2];
        view[1] = HEAPF32[(value + 4) >> 2];
    } else {
        view = HEAPF32.subarray(value >> 2, (value + count * 8) >> 2);
    }
    GLctx.uniform2fv(location, view);
}
function _emscripten_glMatrixMode() {
    throw "Legacy GL function (glMatrixMode) called. If you want legacy GL emulation, you need to compile with -s LEGACY_GL_EMULATION=1 to enable legacy GL emulation.";
}
function _abort() {
    Module["abort"]();
}
function _emscripten_glCreateProgram() {
    var id = GL.getNewId(GL.programs);
    var program = GLctx.createProgram();
    program.name = id;
    GL.programs[id] = program;
    return id;
}
function _emscripten_glFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) {
    GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget, GL.renderbuffers[renderbuffer]);
}
function _pthread_once(ptr, func) {
    if (!_pthread_once.seen) _pthread_once.seen = {};
    if (ptr in _pthread_once.seen) return;
    Runtime.dynCall("v", func);
    _pthread_once.seen[ptr] = 1;
}
function _emscripten_glCompressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data) {
    if (data) {
        data = HEAPU8.subarray(data, data + imageSize);
    } else {
        data = null;
    }
    GLctx["compressedTexImage2D"](target, level, internalFormat, width, height, border, data);
}
function _emscripten_glClearColor(x0, x1, x2, x3) {
    GLctx.clearColor(x0, x1, x2, x3);
}
function _emscripten_glDeleteFramebuffers(n, framebuffers) {
    for (var i = 0; i < n; ++i) {
        var id = HEAP32[(framebuffers + i * 4) >> 2];
        var framebuffer = GL.framebuffers[id];
        if (!framebuffer) continue;
        GLctx.deleteFramebuffer(framebuffer);
        framebuffer.name = 0;
        GL.framebuffers[id] = null;
    }
}
function _emscripten_glBindVertexArray(vao) {
    GL.currentContext.vaoExt.bindVertexArrayOES(GL.vaos[vao]);
}
function _emscripten_glIsBuffer(buffer) {
    var b = GL.buffers[buffer];
    if (!b) return 0;
    return GLctx.isBuffer(b);
}
function _emscripten_glUniform2iv(location, count, value) {
    location = GL.uniforms[location];
    count *= 2;
    value = HEAP32.subarray(value >> 2, (value + count * 4) >> 2);
    GLctx.uniform2iv(location, value);
}
function _pthread_getspecific(key) {
    return PTHREAD_SPECIFIC[key] || 0;
}
function _emscripten_glVertexAttrib1fv(index, v) {
    v = HEAPF32.subarray(v >> 2, (v + 4) >> 2);
    GLctx.vertexAttrib1fv(index, v);
}
function _emscripten_glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
    if (pixels) {
        var data = GL.getTexPixelData(type, format, width, height, pixels, -1);
        pixels = data.pixels;
    } else {
        pixels = null;
    }
    GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels);
}
function _emscripten_glPolygonOffset(x0, x1) {
    GLctx.polygonOffset(x0, x1);
}
function _emscripten_glUniform2f(location, v0, v1) {
    location = GL.uniforms[location];
    GLctx.uniform2f(location, v0, v1);
}
function _emscripten_glLoadMatrixf() {
    Module["printErr"]("missing function: emscripten_glLoadMatrixf");
    abort(-1);
}
Module["_memmove"] = _memmove;
function ___cxa_allocate_exception(size) {
    return _malloc(size);
}
function _emscripten_glUniform2i(location, v0, v1) {
    location = GL.uniforms[location];
    GLctx.uniform2i(location, v0, v1);
}
function _emscripten_glGetProgramInfoLog(program, maxLength, length, infoLog) {
    var log = GLctx.getProgramInfoLog(GL.programs[program]);
    if (!log) log = "";
    log = log.substr(0, maxLength - 1);
    if (maxLength > 0 && infoLog) {
        writeStringToMemory(log, infoLog);
        if (length) HEAP32[length >> 2] = log.length;
    } else {
        if (length) HEAP32[length >> 2] = 0;
    }
}
function _emscripten_glDeleteRenderbuffers(n, renderbuffers) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(renderbuffers + i * 4) >> 2];
        var renderbuffer = GL.renderbuffers[id];
        if (!renderbuffer) continue;
        GLctx.deleteRenderbuffer(renderbuffer);
        renderbuffer.name = 0;
        GL.renderbuffers[id] = null;
    }
}
function _emscripten_glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
    if (pixels) {
        var data = GL.getTexPixelData(type, format, width, height, pixels, internalFormat);
        pixels = data.pixels;
        internalFormat = data.internalFormat;
    } else {
        pixels = null;
    }
    GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels);
}
function _emscripten_glGetUniformiv(program, location, params) {
    var data = GLctx.getUniform(GL.programs[program], GL.uniforms[location]);
    if (typeof data == "number" || typeof data == "boolean") {
        HEAP32[params >> 2] = data;
    } else {
        for (var i = 0; i < data.length; i++) {
            HEAP32[(params + i) >> 2] = data[i];
        }
    }
}
function _emscripten_glActiveTexture(x0) {
    GLctx.activeTexture(x0);
}
function _emscripten_glDepthMask(x0) {
    GLctx.depthMask(x0);
}
function _emscripten_glGetPointerv() {
    Module["printErr"]("missing function: emscripten_glGetPointerv");
    abort(-1);
}
function _emscripten_glDepthRangef(x0, x1) {
    GLctx.depthRange(x0, x1);
}
function _emscripten_glDepthRange(x0, x1) {
    GLctx.depthRange(x0, x1);
}
function _emscripten_glFlush() {
    GLctx.flush();
}
function _emscripten_glStencilMaskSeparate(x0, x1) {
    GLctx.stencilMaskSeparate(x0, x1);
}
function _emscripten_glCreateShader(shaderType) {
    var id = GL.getNewId(GL.shaders);
    GL.shaders[id] = GLctx.createShader(shaderType);
    return id;
}
function _emscripten_glValidateProgram(program) {
    GLctx.validateProgram(GL.programs[program]);
}
function _emscripten_glGetShaderPrecisionFormat(shaderType, precisionType, range, precision) {
    var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
    HEAP32[range >> 2] = result.rangeMin;
    HEAP32[(range + 4) >> 2] = result.rangeMax;
    HEAP32[precision >> 2] = result.precision;
}
function _emscripten_glUniform1fv(location, count, value) {
    location = GL.uniforms[location];
    var view;
    if (count === 1) {
        view = GL.miniTempBufferViews[0];
        view[0] = HEAPF32[value >> 2];
    } else {
        view = HEAPF32.subarray(value >> 2, (value + count * 4) >> 2);
    }
    GLctx.uniform1fv(location, view);
}
function _emscripten_glColorMask(x0, x1, x2, x3) {
    GLctx.colorMask(x0, x1, x2, x3);
}
function _emscripten_glPixelStorei(pname, param) {
    if (pname == 3333) {
        GL.packAlignment = param;
    } else if (pname == 3317) {
        GL.unpackAlignment = param;
    }
    GLctx.pixelStorei(pname, param);
}
function _emscripten_glDeleteTextures(n, textures) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(textures + i * 4) >> 2];
        var texture = GL.textures[id];
        if (!texture) continue;
        GLctx.deleteTexture(texture);
        texture.name = 0;
        GL.textures[id] = null;
    }
}
function _emscripten_glBindProgramARB() {
    Module["printErr"]("missing function: emscripten_glBindProgramARB");
    abort(-1);
}
function _emscripten_glDeleteVertexArrays(n, vaos) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(vaos + i * 4) >> 2];
        GL.currentContext.vaoExt.deleteVertexArrayOES(GL.vaos[id]);
        GL.vaos[id] = null;
    }
}
function _emscripten_glGenVertexArrays(n, arrays) {
    for (var i = 0; i < n; i++) {
        var id = GL.getNewId(GL.vaos);
        var vao = GL.currentContext.vaoExt.createVertexArrayOES();
        vao.name = id;
        GL.vaos[id] = vao;
        HEAP32[(arrays + i * 4) >> 2] = id;
    }
}
function _time(ptr) {
    var ret = (Date.now() / 1e3) | 0;
    if (ptr) {
        HEAP32[ptr >> 2] = ret;
    }
    return ret;
}
function _emscripten_glCheckFramebufferStatus(x0) {
    return GLctx.checkFramebufferStatus(x0);
}
function _emscripten_glDeleteProgram(id) {
    if (!id) return;
    var program = GL.programs[id];
    if (!program) {
        GL.recordError(1281);
        return;
    }
    GLctx.deleteProgram(program);
    program.name = 0;
    GL.programs[id] = null;
    GL.programInfos[id] = null;
}
function _emscripten_glGetBooleanv(name_, p) {
    return GL.get(name_, p, "Boolean");
}
function _emscripten_glDisable(x0) {
    GLctx.disable(x0);
}
function _emscripten_glCompileShader(shader) {
    GLctx.compileShader(GL.shaders[shader]);
}
var GLctx;
GL.init();
FS.staticInit();
__ATINIT__.unshift({
    func: function () {
        if (!Module["noFSInit"] && !FS.init.initialized) FS.init();
    },
});
__ATMAIN__.push({
    func: function () {
        FS.ignorePermissions = false;
    },
});
__ATEXIT__.push({
    func: function () {
        FS.quit();
    },
});
Module["FS_createFolder"] = FS.createFolder;
Module["FS_createPath"] = FS.createPath;
Module["FS_createDataFile"] = FS.createDataFile;
Module["FS_createPreloadedFile"] = FS.createPreloadedFile;
Module["FS_createLazyFile"] = FS.createLazyFile;
Module["FS_createLink"] = FS.createLink;
Module["FS_createDevice"] = FS.createDevice;
___errno_state = Runtime.staticAlloc(4);
HEAP32[___errno_state >> 2] = 0;
__ATINIT__.unshift({
    func: function () {
        TTY.init();
    },
});
__ATEXIT__.push({
    func: function () {
        TTY.shutdown();
    },
});
TTY.utf8 = new Runtime.UTF8Processor();
if (ENVIRONMENT_IS_NODE) {
    var fs = require("fs");
    NODEFS.staticInit();
}
embind_init_charCodes();
BindingError = Module["BindingError"] = extendError(Error, "BindingError");
InternalError = Module["InternalError"] = extendError(Error, "InternalError");
_fputc.ret = allocate([0], "i8", ALLOC_STATIC);
__ATINIT__.push({
    func: function () {
        SOCKFS.root = FS.mount(SOCKFS, {}, null);
    },
});
Module["requestFullScreen"] = function Module_requestFullScreen(lockPointer, resizeCanvas) {
    Browser.requestFullScreen(lockPointer, resizeCanvas);
};
Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) {
    Browser.requestAnimationFrame(func);
};
Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) {
    Browser.setCanvasSize(width, height, noUpdates);
};
Module["pauseMainLoop"] = function Module_pauseMainLoop() {
    Browser.mainLoop.pause();
};
Module["resumeMainLoop"] = function Module_resumeMainLoop() {
    Browser.mainLoop.resume();
};
Module["getUserMedia"] = function Module_getUserMedia() {
    Browser.getUserMedia();
};
init_ClassHandle();
init_RegisteredPointer();
init_embind();
UnboundTypeError = Module["UnboundTypeError"] = extendError(Error, "UnboundTypeError");
init_emval();
STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);
staticSealed = true;
STACK_MAX = STACK_BASE + TOTAL_STACK;
DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);
assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");
var ctlz_i8 = allocate(
    [
        8,
        7,
        6,
        6,
        5,
        5,
        5,
        5,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
    ],
    "i8",
    ALLOC_DYNAMIC
);
var cttz_i8 = allocate(
    [
        8,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        4,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        5,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        4,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        6,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        4,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        5,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        4,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        7,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        4,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        5,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        4,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        6,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        4,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        5,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        4,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
        3,
        0,
        1,
        0,
        2,
        0,
        1,
        0,
    ],
    "i8",
    ALLOC_DYNAMIC
);
function invoke_viiiii(index, a1, a2, a3, a4, a5) {
    try {
        Module["dynCall_viiiii"](index, a1, a2, a3, a4, a5);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_vd(index, a1) {
    try {
        Module["dynCall_vd"](index, a1);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_vid(index, a1, a2) {
    try {
        Module["dynCall_vid"](index, a1, a2);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_vi(index, a1) {
    try {
        Module["dynCall_vi"](index, a1);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_vii(index, a1, a2) {
    try {
        Module["dynCall_vii"](index, a1, a2);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_ii(index, a1) {
    try {
        return Module["dynCall_ii"](index, a1);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_viddd(index, a1, a2, a3, a4) {
    try {
        Module["dynCall_viddd"](index, a1, a2, a3, a4);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_vidd(index, a1, a2, a3) {
    try {
        Module["dynCall_vidd"](index, a1, a2, a3);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_iiii(index, a1, a2, a3) {
    try {
        return Module["dynCall_iiii"](index, a1, a2, a3);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_viiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    try {
        Module["dynCall_viiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7, a8);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
    try {
        Module["dynCall_viiiiii"](index, a1, a2, a3, a4, a5, a6);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_vdd(index, a1, a2) {
    try {
        Module["dynCall_vdd"](index, a1, a2);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_vidddd(index, a1, a2, a3, a4, a5) {
    try {
        Module["dynCall_vidddd"](index, a1, a2, a3, a4, a5);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_vdi(index, a1, a2) {
    try {
        Module["dynCall_vdi"](index, a1, a2);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
    try {
        Module["dynCall_viiiiiii"](index, a1, a2, a3, a4, a5, a6, a7);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    try {
        Module["dynCall_viiiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_iii(index, a1, a2) {
    try {
        return Module["dynCall_iii"](index, a1, a2);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_diii(index, a1, a2, a3) {
    try {
        return Module["dynCall_diii"](index, a1, a2, a3);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_dii(index, a1, a2) {
    try {
        return Module["dynCall_dii"](index, a1, a2);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_i(index) {
    try {
        return Module["dynCall_i"](index);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_vdddddd(index, a1, a2, a3, a4, a5, a6) {
    try {
        Module["dynCall_vdddddd"](index, a1, a2, a3, a4, a5, a6);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_vdddd(index, a1, a2, a3, a4) {
    try {
        Module["dynCall_vdddd"](index, a1, a2, a3, a4);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_viii(index, a1, a2, a3) {
    try {
        Module["dynCall_viii"](index, a1, a2, a3);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_v(index) {
    try {
        Module["dynCall_v"](index);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_viid(index, a1, a2, a3) {
    try {
        Module["dynCall_viid"](index, a1, a2, a3);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
function invoke_viiii(index, a1, a2, a3, a4) {
    try {
        Module["dynCall_viiii"](index, a1, a2, a3, a4);
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        asm["setThrew"](1, 0);
    }
}
Module.asmGlobalArg = { Math: Math, Int8Array: Int8Array, Int16Array: Int16Array, Int32Array: Int32Array, Uint8Array: Uint8Array, Uint16Array: Uint16Array, Uint32Array: Uint32Array, Float32Array: Float32Array, Float64Array: Float64Array };
Module.asmLibraryArg = {
    abort: abort,
    assert: assert,
    min: Math_min,
    invoke_viiiii: invoke_viiiii,
    invoke_vd: invoke_vd,
    invoke_vid: invoke_vid,
    invoke_vi: invoke_vi,
    invoke_vii: invoke_vii,
    invoke_ii: invoke_ii,
    invoke_viddd: invoke_viddd,
    invoke_vidd: invoke_vidd,
    invoke_iiii: invoke_iiii,
    invoke_viiiiiiii: invoke_viiiiiiii,
    invoke_viiiiii: invoke_viiiiii,
    invoke_vdd: invoke_vdd,
    invoke_vidddd: invoke_vidddd,
    invoke_vdi: invoke_vdi,
    invoke_viiiiiii: invoke_viiiiiii,
    invoke_viiiiiiiii: invoke_viiiiiiiii,
    invoke_iii: invoke_iii,
    invoke_diii: invoke_diii,
    invoke_dii: invoke_dii,
    invoke_i: invoke_i,
    invoke_vdddddd: invoke_vdddddd,
    invoke_vdddd: invoke_vdddd,
    invoke_viii: invoke_viii,
    invoke_v: invoke_v,
    invoke_viid: invoke_viid,
    invoke_viiii: invoke_viiii,
    _emscripten_glGetTexParameterfv: _emscripten_glGetTexParameterfv,
    _emscripten_glGenRenderbuffers: _emscripten_glGenRenderbuffers,
    floatReadValueFromPointer: floatReadValueFromPointer,
    simpleReadValueFromPointer: simpleReadValueFromPointer,
    _emscripten_glReleaseShaderCompiler: _emscripten_glReleaseShaderCompiler,
    _emscripten_glBlendFuncSeparate: _emscripten_glBlendFuncSeparate,
    _emscripten_glGetShaderPrecisionFormat: _emscripten_glGetShaderPrecisionFormat,
    throwInternalError: throwInternalError,
    _emscripten_glGetIntegerv: _emscripten_glGetIntegerv,
    _emscripten_glCullFace: _emscripten_glCullFace,
    getLiveInheritedInstances: getLiveInheritedInstances,
    _emscripten_glFrontFace: _emscripten_glFrontFace,
    _emscripten_glVertexAttrib3fv: _emscripten_glVertexAttrib3fv,
    ___assert_fail: ___assert_fail,
    _emscripten_glDrawArrays: _emscripten_glDrawArrays,
    _emscripten_glUniform3fv: _emscripten_glUniform3fv,
    __ZSt18uncaught_exceptionv: __ZSt18uncaught_exceptionv,
    ClassHandle: ClassHandle,
    _emscripten_glUseProgram: _emscripten_glUseProgram,
    getShiftFromSize: getShiftFromSize,
    _emscripten_glDepthFunc: _emscripten_glDepthFunc,
    _emscripten_glCompressedTexImage2D: _emscripten_glCompressedTexImage2D,
    _emscripten_set_main_loop_timing: _emscripten_set_main_loop_timing,
    _sbrk: _sbrk,
    _emscripten_glGenerateMipmap: _emscripten_glGenerateMipmap,
    _emscripten_glDisableVertexAttribArray: _emscripten_glDisableVertexAttribArray,
    _emscripten_glUniform3iv: _emscripten_glUniform3iv,
    ___cxa_begin_catch: ___cxa_begin_catch,
    _emscripten_memcpy_big: _emscripten_memcpy_big,
    runDestructor: runDestructor,
    nonConstNoSmartPtrRawPointerToWireType: nonConstNoSmartPtrRawPointerToWireType,
    _sysconf: _sysconf,
    throwInstanceAlreadyDeleted: throwInstanceAlreadyDeleted,
    __embind_register_std_string: __embind_register_std_string,
    _emscripten_glVertexPointer: _emscripten_glVertexPointer,
    _emscripten_glBlendEquationSeparate: _emscripten_glBlendEquationSeparate,
    _emscripten_glGetBooleanv: _emscripten_glGetBooleanv,
    init_RegisteredPointer: init_RegisteredPointer,
    ClassHandle_isAliasOf: ClassHandle_isAliasOf,
    _emscripten_glLineWidth: _emscripten_glLineWidth,
    _emscripten_glUniform1i: _emscripten_glUniform1i,
    _fread: _fread,
    _emscripten_glGenBuffers: _emscripten_glGenBuffers,
    makeClassHandle: makeClassHandle,
    get_first_emval: get_first_emval,
    _emscripten_glVertexAttribPointer: _emscripten_glVertexAttribPointer,
    _emscripten_glIsProgram: _emscripten_glIsProgram,
    _write: _write,
    whenDependentTypesAreResolved: whenDependentTypesAreResolved,
    _fsync: _fsync,
    __embind_register_class_constructor: __embind_register_class_constructor,
    _emscripten_glGetString: _emscripten_glGetString,
    _emscripten_glIsFramebuffer: _emscripten_glIsFramebuffer,
    count_emval_handles: count_emval_handles,
    _emscripten_glIsEnabled: _emscripten_glIsEnabled,
    _emscripten_glScissor: _emscripten_glScissor,
    _emscripten_glVertexAttrib4fv: _emscripten_glVertexAttrib4fv,
    _emscripten_glTexParameteriv: _emscripten_glTexParameteriv,
    init_ClassHandle: init_ClassHandle,
    _emscripten_glBindProgramARB: _emscripten_glBindProgramARB,
    _emscripten_glStencilOpSeparate: _emscripten_glStencilOpSeparate,
    ClassHandle_clone: ClassHandle_clone,
    _emscripten_glIsBuffer: _emscripten_glIsBuffer,
    _emscripten_glVertexAttrib1f: _emscripten_glVertexAttrib1f,
    _emscripten_glStencilMaskSeparate: _emscripten_glStencilMaskSeparate,
    _emscripten_glGetActiveAttrib: _emscripten_glGetActiveAttrib,
    _emscripten_glAttachShader: _emscripten_glAttachShader,
    _emscripten_glDrawRangeElements: _emscripten_glDrawRangeElements,
    _emscripten_glCompressedTexSubImage2D: _emscripten_glCompressedTexSubImage2D,
    _emscripten_glUniform2f: _emscripten_glUniform2f,
    _emscripten_glTexParameterfv: _emscripten_glTexParameterfv,
    _emscripten_glUniformMatrix2fv: _emscripten_glUniformMatrix2fv,
    throwBindingError: throwBindingError,
    _emscripten_glTexParameterf: _emscripten_glTexParameterf,
    _emscripten_glGetAttachedShaders: _emscripten_glGetAttachedShaders,
    _emscripten_glGenTextures: _emscripten_glGenTextures,
    _emscripten_glDrawArraysInstanced: _emscripten_glDrawArraysInstanced,
    _emscripten_glDepthRange: _emscripten_glDepthRange,
    ___cxa_find_matching_catch: ___cxa_find_matching_catch,
    __embind_register_value_object_field: __embind_register_value_object_field,
    _emscripten_glShaderBinary: _emscripten_glShaderBinary,
    embind_init_charCodes: embind_init_charCodes,
    _emscripten_glGenVertexArrays: _emscripten_glGenVertexArrays,
    _emscripten_glVertexAttrib2fv: _emscripten_glVertexAttrib2fv,
    _emscripten_glBufferData: _emscripten_glBufferData,
    _emscripten_glUniform4iv: _emscripten_glUniform4iv,
    _emscripten_glGetTexParameteriv: _emscripten_glGetTexParameteriv,
    ___setErrNo: ___setErrNo,
    _emscripten_glDrawElementsInstanced: _emscripten_glDrawElementsInstanced,
    _emscripten_glBindAttribLocation: _emscripten_glBindAttribLocation,
    _emscripten_glDrawElements: _emscripten_glDrawElements,
    _emscripten_glClientActiveTexture: _emscripten_glClientActiveTexture,
    _emscripten_glVertexAttrib2f: _emscripten_glVertexAttrib2f,
    __embind_register_bool: __embind_register_bool,
    ___resumeException: ___resumeException,
    _emscripten_glFlush: _emscripten_glFlush,
    _emscripten_glPolygonOffset: _emscripten_glPolygonOffset,
    _emscripten_glCheckFramebufferStatus: _emscripten_glCheckFramebufferStatus,
    _emscripten_glGetError: _emscripten_glGetError,
    _emscripten_glClearDepthf: _emscripten_glClearDepthf,
    createNamedFunction: createNamedFunction,
    __embind_register_class_property: __embind_register_class_property,
    __embind_register_emval: __embind_register_emval,
    _emscripten_glUniform3f: _emscripten_glUniform3f,
    _emscripten_glUniform3i: _emscripten_glUniform3i,
    __emval_decref: __emval_decref,
    _pthread_once: _pthread_once,
    _emscripten_glDeleteShader: _emscripten_glDeleteShader,
    _emscripten_glReadPixels: _emscripten_glReadPixels,
    _emscripten_glBlendColor: _emscripten_glBlendColor,
    __embind_register_class: __embind_register_class,
    _emscripten_glClearStencil: _emscripten_glClearStencil,
    constNoSmartPtrRawPointerToWireType: constNoSmartPtrRawPointerToWireType,
    _emscripten_glGetUniformLocation: _emscripten_glGetUniformLocation,
    heap32VectorToArray: heap32VectorToArray,
    __embind_finalize_value_object: __embind_finalize_value_object,
    _emscripten_glGetAttribLocation: _emscripten_glGetAttribLocation,
    _mkport: _mkport,
    _emscripten_glNormalPointer: _emscripten_glNormalPointer,
    _emscripten_glHint: _emscripten_glHint,
    ClassHandle_delete: ClassHandle_delete,
    _emscripten_glTexCoordPointer: _emscripten_glTexCoordPointer,
    _emscripten_glEnable: _emscripten_glEnable,
    _emscripten_glClearDepth: _emscripten_glClearDepth,
    _read: _read,
    RegisteredPointer_destructor: RegisteredPointer_destructor,
    _emscripten_glBindFramebuffer: _emscripten_glBindFramebuffer,
    _emscripten_glLoadMatrixf: _emscripten_glLoadMatrixf,
    ensureOverloadTable: ensureOverloadTable,
    _emscripten_glBindRenderbuffer: _emscripten_glBindRenderbuffer,
    _time: _time,
    _fprintf: _fprintf,
    _emscripten_glMatrixMode: _emscripten_glMatrixMode,
    new_: new_,
    downcastPointer: downcastPointer,
    _emscripten_glGetFramebufferAttachmentParameteriv: _emscripten_glGetFramebufferAttachmentParameteriv,
    replacePublicSymbol: replacePublicSymbol,
    init_embind: init_embind,
    _emscripten_glUniform4i: _emscripten_glUniform4i,
    _emscripten_glGetObjectParameterivARB: _emscripten_glGetObjectParameterivARB,
    _emscripten_glLoadIdentity: _emscripten_glLoadIdentity,
    ClassHandle_deleteLater: ClassHandle_deleteLater,
    _emscripten_glUniform4f: _emscripten_glUniform4f,
    RegisteredPointer_deleteObject: RegisteredPointer_deleteObject,
    ClassHandle_isDeleted: ClassHandle_isDeleted,
    _vfprintf: _vfprintf,
    __embind_register_integer: __embind_register_integer,
    _emscripten_glClear: _emscripten_glClear,
    ___cxa_allocate_exception: ___cxa_allocate_exception,
    _emscripten_glBlendFunc: _emscripten_glBlendFunc,
    _emscripten_glGetShaderInfoLog: _emscripten_glGetShaderInfoLog,
    _emscripten_glStencilMask: _emscripten_glStencilMask,
    _emscripten_glUniform1iv: _emscripten_glUniform1iv,
    _emscripten_glGetVertexAttribPointerv: _emscripten_glGetVertexAttribPointerv,
    ___errno_location: ___errno_location,
    _pwrite: _pwrite,
    _emscripten_glUniform2i: _emscripten_glUniform2i,
    _pthread_setspecific: _pthread_setspecific,
    _emscripten_glDeleteVertexArrays: _emscripten_glDeleteVertexArrays,
    _emscripten_glGetActiveUniform: _emscripten_glGetActiveUniform,
    _emscripten_glEnableVertexAttribArray: _emscripten_glEnableVertexAttribArray,
    _emscripten_glUniform2iv: _emscripten_glUniform2iv,
    _emscripten_glDisable: _emscripten_glDisable,
    _emscripten_glGetBufferParameteriv: _emscripten_glGetBufferParameteriv,
    __embind_register_value_object: __embind_register_value_object,
    _emscripten_glDeleteRenderbuffers: _emscripten_glDeleteRenderbuffers,
    _embind_repr: _embind_repr,
    _pthread_getspecific: _pthread_getspecific,
    _emscripten_glVertexAttrib4f: _emscripten_glVertexAttrib4f,
    _emscripten_glGetVertexAttribiv: _emscripten_glGetVertexAttribiv,
    _emscripten_glCreateShader: _emscripten_glCreateShader,
    _emscripten_glGetProgramiv: _emscripten_glGetProgramiv,
    _emscripten_glPixelStorei: _emscripten_glPixelStorei,
    __embind_register_class_function: __embind_register_class_function,
    RegisteredPointer: RegisteredPointer,
    craftInvokerFunction: craftInvokerFunction,
    _emscripten_glUniformMatrix3fv: _emscripten_glUniformMatrix3fv,
    _emscripten_glColorPointer: _emscripten_glColorPointer,
    _fclose: _fclose,
    runDestructors: runDestructors,
    makeLegalFunctionName: makeLegalFunctionName,
    _pthread_key_create: _pthread_key_create,
    upcastPointer: upcastPointer,
    _emscripten_glViewport: _emscripten_glViewport,
    init_emval: init_emval,
    _emscripten_glRenderbufferStorage: _emscripten_glRenderbufferStorage,
    shallowCopyInternalPointer: shallowCopyInternalPointer,
    _emscripten_glDepthMask: _emscripten_glDepthMask,
    _emscripten_glDrawBuffers: _emscripten_glDrawBuffers,
    _recv: _recv,
    _emscripten_glDeleteProgram: _emscripten_glDeleteProgram,
    _emscripten_glCopyTexImage2D: _emscripten_glCopyTexImage2D,
    _emscripten_glFramebufferTexture2D: _emscripten_glFramebufferTexture2D,
    _emscripten_glFramebufferRenderbuffer: _emscripten_glFramebufferRenderbuffer,
    _send: _send,
    _fputc: _fputc,
    _emscripten_glStencilFunc: _emscripten_glStencilFunc,
    _abort: _abort,
    _emscripten_glGetUniformiv: _emscripten_glGetUniformiv,
    validateThis: validateThis,
    _emscripten_glRotatef: _emscripten_glRotatef,
    _emscripten_glGetShaderiv: _emscripten_glGetShaderiv,
    exposePublicSymbol: exposePublicSymbol,
    _close: _close,
    _emscripten_glGenFramebuffers: _emscripten_glGenFramebuffers,
    _emscripten_glUniformMatrix4fv: _emscripten_glUniformMatrix4fv,
    _emscripten_glGetPointerv: _emscripten_glGetPointerv,
    _emscripten_glUniform1f: _emscripten_glUniform1f,
    RegisteredPointer_fromWireType: RegisteredPointer_fromWireType,
    _emscripten_glUniform1fv: _emscripten_glUniform1fv,
    _emscripten_glIsRenderbuffer: _emscripten_glIsRenderbuffer,
    __embind_register_memory_view: __embind_register_memory_view,
    _emscripten_glShaderSource: _emscripten_glShaderSource,
    setDelayFunction: setDelayFunction,
    _emscripten_glTexParameteri: _emscripten_glTexParameteri,
    extendError: extendError,
    _emscripten_glStencilFuncSeparate: _emscripten_glStencilFuncSeparate,
    _emscripten_glCopyTexSubImage2D: _emscripten_glCopyTexSubImage2D,
    __embind_register_void: __embind_register_void,
    _emscripten_glDeleteTextures: _emscripten_glDeleteTextures,
    _emscripten_glVertexAttrib3f: _emscripten_glVertexAttrib3f,
    __embind_register_function: __embind_register_function,
    _emscripten_glVertexAttribDivisor: _emscripten_glVertexAttribDivisor,
    _emscripten_glTexSubImage2D: _emscripten_glTexSubImage2D,
    _emscripten_glGetUniformfv: _emscripten_glGetUniformfv,
    _emscripten_glGetVertexAttribfv: _emscripten_glGetVertexAttribfv,
    _emscripten_glGetRenderbufferParameteriv: _emscripten_glGetRenderbufferParameteriv,
    __reallyNegative: __reallyNegative,
    __emval_register: __emval_register,
    RegisteredPointer_getPointee: RegisteredPointer_getPointee,
    _emscripten_glFinish: _emscripten_glFinish,
    _emscripten_glGetInfoLogARB: _emscripten_glGetInfoLogARB,
    _emscripten_glCompileShader: _emscripten_glCompileShader,
    __embind_register_std_wstring: __embind_register_std_wstring,
    _fileno: _fileno,
    _emscripten_glFrustum: _emscripten_glFrustum,
    _emscripten_glSampleCoverage: _emscripten_glSampleCoverage,
    _emscripten_glDepthRangef: _emscripten_glDepthRangef,
    throwUnboundTypeError: throwUnboundTypeError,
    _fwrite: _fwrite,
    _emscripten_glStencilOp: _emscripten_glStencilOp,
    getInheritedInstance: getInheritedInstance,
    _emscripten_glBindBuffer: _emscripten_glBindBuffer,
    _emscripten_glLinkProgram: _emscripten_glLinkProgram,
    _emscripten_glBlendEquation: _emscripten_glBlendEquation,
    readLatin1String: readLatin1String,
    _emscripten_glIsTexture: _emscripten_glIsTexture,
    getBasestPointer: getBasestPointer,
    _pread: _pread,
    _emscripten_glBindVertexArray: _emscripten_glBindVertexArray,
    getInheritedInstanceCount: getInheritedInstanceCount,
    _emscripten_glDeleteObjectARB: _emscripten_glDeleteObjectARB,
    _emscripten_glActiveTexture: _emscripten_glActiveTexture,
    flushPendingDeletes: flushPendingDeletes,
    _emscripten_glDeleteBuffers: _emscripten_glDeleteBuffers,
    integerReadValueFromPointer: integerReadValueFromPointer,
    _emscripten_glBufferSubData: _emscripten_glBufferSubData,
    _emscripten_glVertexAttrib1fv: _emscripten_glVertexAttrib1fv,
    __embind_register_float: __embind_register_float,
    _fflush: _fflush,
    _emscripten_glIsShader: _emscripten_glIsShader,
    _emscripten_glGetProgramInfoLog: _emscripten_glGetProgramInfoLog,
    _emscripten_glDeleteFramebuffers: _emscripten_glDeleteFramebuffers,
    _emscripten_glUniform4fv: _emscripten_glUniform4fv,
    genericPointerToWireType: genericPointerToWireType,
    registerType: registerType,
    ___cxa_throw: ___cxa_throw,
    _emscripten_set_main_loop: _emscripten_set_main_loop,
    _emscripten_glClearColor: _emscripten_glClearColor,
    _emscripten_glGetShaderSource: _emscripten_glGetShaderSource,
    _emscripten_glCreateProgram: _emscripten_glCreateProgram,
    _emscripten_glValidateProgram: _emscripten_glValidateProgram,
    requireFunction: requireFunction,
    _emscripten_glUniform2fv: _emscripten_glUniform2fv,
    __formatString: __formatString,
    _emscripten_glGetFloatv: _emscripten_glGetFloatv,
    _emscripten_glDetachShader: _emscripten_glDetachShader,
    _emscripten_glColorMask: _emscripten_glColorMask,
    _emscripten_glEnableClientState: _emscripten_glEnableClientState,
    RegisteredClass: RegisteredClass,
    _emscripten_glBindTexture: _emscripten_glBindTexture,
    _emscripten_glTexImage2D: _emscripten_glTexImage2D,
    STACKTOP: STACKTOP,
    STACK_MAX: STACK_MAX,
    tempDoublePtr: tempDoublePtr,
    ABORT: ABORT,
    cttz_i8: cttz_i8,
    ctlz_i8: ctlz_i8,
    NaN: NaN,
    Infinity: Infinity,
    _stderr: _stderr,
}; // EMSCRIPTEN_START_ASM
var asm = (function (global, env, buffer) {
    "use asm";
    var a = new global.Int8Array(buffer);
    var b = new global.Int16Array(buffer);
    var c = new global.Int32Array(buffer);
    var d = new global.Uint8Array(buffer);
    var e = new global.Uint16Array(buffer);
    var f = new global.Uint32Array(buffer);
    var g = new global.Float32Array(buffer);
    var h = new global.Float64Array(buffer);
    var i = env.STACKTOP | 0;
    var j = env.STACK_MAX | 0;
    var k = env.tempDoublePtr | 0;
    var l = env.ABORT | 0;
    var m = env.cttz_i8 | 0;
    var n = env.ctlz_i8 | 0;
    var o = env._stderr | 0;
    var p = 0;
    var q = 0;
    var r = 0;
    var s = 0;
    var t = +env.NaN,
        u = +env.Infinity;
    var v = 0,
        w = 0,
        x = 0,
        y = 0,
        z = 0.0,
        A = 0,
        B = 0,
        C = 0,
        D = 0.0;
    var E = 0;
    var F = 0;
    var G = 0;
    var H = 0;
    var I = 0;
    var J = 0;
    var K = 0;
    var L = 0;
    var M = 0;
    var N = 0;
    var O = global.Math.floor;
    var P = global.Math.abs;
    var Q = global.Math.sqrt;
    var R = global.Math.pow;
    var S = global.Math.cos;
    var T = global.Math.sin;
    var U = global.Math.tan;
    var V = global.Math.acos;
    var W = global.Math.asin;
    var X = global.Math.atan;
    var Y = global.Math.atan2;
    var Z = global.Math.exp;
    var _ = global.Math.log;
    var $ = global.Math.ceil;
    var aa = global.Math.imul;
    var ba = env.abort;
    var ca = env.assert;
    var da = env.min;
    var ea = env.invoke_viiiii;
    var fa = env.invoke_vd;
    var ga = env.invoke_vid;
    var ha = env.invoke_vi;
    var ia = env.invoke_vii;
    var ja = env.invoke_ii;
    var ka = env.invoke_viddd;
    var la = env.invoke_vidd;
    var ma = env.invoke_iiii;
    var na = env.invoke_viiiiiiii;
    var oa = env.invoke_viiiiii;
    var pa = env.invoke_vdd;
    var qa = env.invoke_vidddd;
    var ra = env.invoke_vdi;
    var sa = env.invoke_viiiiiii;
    var ta = env.invoke_viiiiiiiii;
    var ua = env.invoke_iii;
    var va = env.invoke_diii;
    var wa = env.invoke_dii;
    var xa = env.invoke_i;
    var ya = env.invoke_vdddddd;
    var za = env.invoke_vdddd;
    var Aa = env.invoke_viii;
    var Ba = env.invoke_v;
    var Ca = env.invoke_viid;
    var Da = env.invoke_viiii;
    var Ea = env._emscripten_glGetTexParameterfv;
    var Fa = env._emscripten_glGenRenderbuffers;
    var Ga = env.floatReadValueFromPointer;
    var Ha = env.simpleReadValueFromPointer;
    var Ia = env._emscripten_glReleaseShaderCompiler;
    var Ja = env._emscripten_glBlendFuncSeparate;
    var Ka = env._emscripten_glGetShaderPrecisionFormat;
    var La = env.throwInternalError;
    var Ma = env._emscripten_glGetIntegerv;
    var Na = env._emscripten_glCullFace;
    var Oa = env.getLiveInheritedInstances;
    var Pa = env._emscripten_glFrontFace;
    var Qa = env._emscripten_glVertexAttrib3fv;
    var Ra = env.___assert_fail;
    var Sa = env._emscripten_glDrawArrays;
    var Ta = env._emscripten_glUniform3fv;
    var Ua = env.__ZSt18uncaught_exceptionv;
    var Va = env.ClassHandle;
    var Wa = env._emscripten_glUseProgram;
    var Xa = env.getShiftFromSize;
    var Ya = env._emscripten_glDepthFunc;
    var Za = env._emscripten_glCompressedTexImage2D;
    var _a = env._emscripten_set_main_loop_timing;
    var $a = env._sbrk;
    var ab = env._emscripten_glGenerateMipmap;
    var bb = env._emscripten_glDisableVertexAttribArray;
    var cb = env._emscripten_glUniform3iv;
    var db = env.___cxa_begin_catch;
    var eb = env._emscripten_memcpy_big;
    var fb = env.runDestructor;
    var gb = env.nonConstNoSmartPtrRawPointerToWireType;
    var hb = env._sysconf;
    var ib = env.throwInstanceAlreadyDeleted;
    var jb = env.__embind_register_std_string;
    var kb = env._emscripten_glVertexPointer;
    var lb = env._emscripten_glBlendEquationSeparate;
    var mb = env._emscripten_glGetBooleanv;
    var nb = env.init_RegisteredPointer;
    var ob = env.ClassHandle_isAliasOf;
    var pb = env._emscripten_glLineWidth;
    var qb = env._emscripten_glUniform1i;
    var rb = env._fread;
    var sb = env._emscripten_glGenBuffers;
    var tb = env.makeClassHandle;
    var ub = env.get_first_emval;
    var vb = env._emscripten_glVertexAttribPointer;
    var wb = env._emscripten_glIsProgram;
    var xb = env._write;
    var yb = env.whenDependentTypesAreResolved;
    var zb = env._fsync;
    var Ab = env.__embind_register_class_constructor;
    var Bb = env._emscripten_glGetString;
    var Cb = env._emscripten_glIsFramebuffer;
    var Db = env.count_emval_handles;
    var Eb = env._emscripten_glIsEnabled;
    var Fb = env._emscripten_glScissor;
    var Gb = env._emscripten_glVertexAttrib4fv;
    var Hb = env._emscripten_glTexParameteriv;
    var Ib = env.init_ClassHandle;
    var Jb = env._emscripten_glBindProgramARB;
    var Kb = env._emscripten_glStencilOpSeparate;
    var Lb = env.ClassHandle_clone;
    var Mb = env._emscripten_glIsBuffer;
    var Nb = env._emscripten_glVertexAttrib1f;
    var Ob = env._emscripten_glStencilMaskSeparate;
    var Pb = env._emscripten_glGetActiveAttrib;
    var Qb = env._emscripten_glAttachShader;
    var Rb = env._emscripten_glDrawRangeElements;
    var Sb = env._emscripten_glCompressedTexSubImage2D;
    var Tb = env._emscripten_glUniform2f;
    var Ub = env._emscripten_glTexParameterfv;
    var Vb = env._emscripten_glUniformMatrix2fv;
    var Wb = env.throwBindingError;
    var Xb = env._emscripten_glTexParameterf;
    var Yb = env._emscripten_glGetAttachedShaders;
    var Zb = env._emscripten_glGenTextures;
    var _b = env._emscripten_glDrawArraysInstanced;
    var $b = env._emscripten_glDepthRange;
    var ac = env.___cxa_find_matching_catch;
    var bc = env.__embind_register_value_object_field;
    var cc = env._emscripten_glShaderBinary;
    var dc = env.embind_init_charCodes;
    var ec = env._emscripten_glGenVertexArrays;
    var fc = env._emscripten_glVertexAttrib2fv;
    var gc = env._emscripten_glBufferData;
    var hc = env._emscripten_glUniform4iv;
    var ic = env._emscripten_glGetTexParameteriv;
    var jc = env.___setErrNo;
    var kc = env._emscripten_glDrawElementsInstanced;
    var lc = env._emscripten_glBindAttribLocation;
    var mc = env._emscripten_glDrawElements;
    var nc = env._emscripten_glClientActiveTexture;
    var oc = env._emscripten_glVertexAttrib2f;
    var pc = env.__embind_register_bool;
    var qc = env.___resumeException;
    var rc = env._emscripten_glFlush;
    var sc = env._emscripten_glPolygonOffset;
    var tc = env._emscripten_glCheckFramebufferStatus;
    var uc = env._emscripten_glGetError;
    var vc = env._emscripten_glClearDepthf;
    var wc = env.createNamedFunction;
    var xc = env.__embind_register_class_property;
    var yc = env.__embind_register_emval;
    var zc = env._emscripten_glUniform3f;
    var Ac = env._emscripten_glUniform3i;
    var Bc = env.__emval_decref;
    var Cc = env._pthread_once;
    var Dc = env._emscripten_glDeleteShader;
    var Ec = env._emscripten_glReadPixels;
    var Fc = env._emscripten_glBlendColor;
    var Gc = env.__embind_register_class;
    var Hc = env._emscripten_glClearStencil;
    var Ic = env.constNoSmartPtrRawPointerToWireType;
    var Jc = env._emscripten_glGetUniformLocation;
    var Kc = env.heap32VectorToArray;
    var Lc = env.__embind_finalize_value_object;
    var Mc = env._emscripten_glGetAttribLocation;
    var Nc = env._mkport;
    var Oc = env._emscripten_glNormalPointer;
    var Pc = env._emscripten_glHint;
    var Qc = env.ClassHandle_delete;
    var Rc = env._emscripten_glTexCoordPointer;
    var Sc = env._emscripten_glEnable;
    var Tc = env._emscripten_glClearDepth;
    var Uc = env._read;
    var Vc = env.RegisteredPointer_destructor;
    var Wc = env._emscripten_glBindFramebuffer;
    var Xc = env._emscripten_glLoadMatrixf;
    var Yc = env.ensureOverloadTable;
    var Zc = env._emscripten_glBindRenderbuffer;
    var _c = env._time;
    var $c = env._fprintf;
    var ad = env._emscripten_glMatrixMode;
    var bd = env.new_;
    var cd = env.downcastPointer;
    var dd = env._emscripten_glGetFramebufferAttachmentParameteriv;
    var ed = env.replacePublicSymbol;
    var fd = env.init_embind;
    var gd = env._emscripten_glUniform4i;
    var hd = env._emscripten_glGetObjectParameterivARB;
    var id = env._emscripten_glLoadIdentity;
    var jd = env.ClassHandle_deleteLater;
    var kd = env._emscripten_glUniform4f;
    var ld = env.RegisteredPointer_deleteObject;
    var md = env.ClassHandle_isDeleted;
    var nd = env._vfprintf;
    var od = env.__embind_register_integer;
    var pd = env._emscripten_glClear;
    var qd = env.___cxa_allocate_exception;
    var rd = env._emscripten_glBlendFunc;
    var sd = env._emscripten_glGetShaderInfoLog;
    var td = env._emscripten_glStencilMask;
    var ud = env._emscripten_glUniform1iv;
    var vd = env._emscripten_glGetVertexAttribPointerv;
    var wd = env.___errno_location;
    var xd = env._pwrite;
    var yd = env._emscripten_glUniform2i;
    var zd = env._pthread_setspecific;
    var Ad = env._emscripten_glDeleteVertexArrays;
    var Bd = env._emscripten_glGetActiveUniform;
    var Cd = env._emscripten_glEnableVertexAttribArray;
    var Dd = env._emscripten_glUniform2iv;
    var Ed = env._emscripten_glDisable;
    var Fd = env._emscripten_glGetBufferParameteriv;
    var Gd = env.__embind_register_value_object;
    var Hd = env._emscripten_glDeleteRenderbuffers;
    var Id = env._embind_repr;
    var Jd = env._pthread_getspecific;
    var Kd = env._emscripten_glVertexAttrib4f;
    var Ld = env._emscripten_glGetVertexAttribiv;
    var Md = env._emscripten_glCreateShader;
    var Nd = env._emscripten_glGetProgramiv;
    var Od = env._emscripten_glPixelStorei;
    var Pd = env.__embind_register_class_function;
    var Qd = env.RegisteredPointer;
    var Rd = env.craftInvokerFunction;
    var Sd = env._emscripten_glUniformMatrix3fv;
    var Td = env._emscripten_glColorPointer;
    var Ud = env._fclose;
    var Vd = env.runDestructors;
    var Wd = env.makeLegalFunctionName;
    var Xd = env._pthread_key_create;
    var Yd = env.upcastPointer;
    var Zd = env._emscripten_glViewport;
    var _d = env.init_emval;
    var $d = env._emscripten_glRenderbufferStorage;
    var ae = env.shallowCopyInternalPointer;
    var be = env._emscripten_glDepthMask;
    var ce = env._emscripten_glDrawBuffers;
    var de = env._recv;
    var ee = env._emscripten_glDeleteProgram;
    var fe = env._emscripten_glCopyTexImage2D;
    var ge = env._emscripten_glFramebufferTexture2D;
    var he = env._emscripten_glFramebufferRenderbuffer;
    var ie = env._send;
    var je = env._fputc;
    var ke = env._emscripten_glStencilFunc;
    var le = env._abort;
    var me = env._emscripten_glGetUniformiv;
    var ne = env.validateThis;
    var oe = env._emscripten_glRotatef;
    var pe = env._emscripten_glGetShaderiv;
    var qe = env.exposePublicSymbol;
    var re = env._close;
    var se = env._emscripten_glGenFramebuffers;
    var te = env._emscripten_glUniformMatrix4fv;
    var ue = env._emscripten_glGetPointerv;
    var ve = env._emscripten_glUniform1f;
    var we = env.RegisteredPointer_fromWireType;
    var xe = env._emscripten_glUniform1fv;
    var ye = env._emscripten_glIsRenderbuffer;
    var ze = env.__embind_register_memory_view;
    var Ae = env._emscripten_glShaderSource;
    var Be = env.setDelayFunction;
    var Ce = env._emscripten_glTexParameteri;
    var De = env.extendError;
    var Ee = env._emscripten_glStencilFuncSeparate;
    var Fe = env._emscripten_glCopyTexSubImage2D;
    var Ge = env.__embind_register_void;
    var He = env._emscripten_glDeleteTextures;
    var Ie = env._emscripten_glVertexAttrib3f;
    var Je = env.__embind_register_function;
    var Ke = env._emscripten_glVertexAttribDivisor;
    var Le = env._emscripten_glTexSubImage2D;
    var Me = env._emscripten_glGetUniformfv;
    var Ne = env._emscripten_glGetVertexAttribfv;
    var Oe = env._emscripten_glGetRenderbufferParameteriv;
    var Pe = env.__reallyNegative;
    var Qe = env.__emval_register;
    var Re = env.RegisteredPointer_getPointee;
    var Se = env._emscripten_glFinish;
    var Te = env._emscripten_glGetInfoLogARB;
    var Ue = env._emscripten_glCompileShader;
    var Ve = env.__embind_register_std_wstring;
    var We = env._fileno;
    var Xe = env._emscripten_glFrustum;
    var Ye = env._emscripten_glSampleCoverage;
    var Ze = env._emscripten_glDepthRangef;
    var _e = env.throwUnboundTypeError;
    var $e = env._fwrite;
    var af = env._emscripten_glStencilOp;
    var bf = env.getInheritedInstance;
    var cf = env._emscripten_glBindBuffer;
    var df = env._emscripten_glLinkProgram;
    var ef = env._emscripten_glBlendEquation;
    var ff = env.readLatin1String;
    var gf = env._emscripten_glIsTexture;
    var hf = env.getBasestPointer;
    var jf = env._pread;
    var kf = env._emscripten_glBindVertexArray;
    var lf = env.getInheritedInstanceCount;
    var mf = env._emscripten_glDeleteObjectARB;
    var nf = env._emscripten_glActiveTexture;
    var of = env.flushPendingDeletes;
    var pf = env._emscripten_glDeleteBuffers;
    var qf = env.integerReadValueFromPointer;
    var rf = env._emscripten_glBufferSubData;
    var sf = env._emscripten_glVertexAttrib1fv;
    var tf = env.__embind_register_float;
    var uf = env._fflush;
    var vf = env._emscripten_glIsShader;
    var wf = env._emscripten_glGetProgramInfoLog;
    var xf = env._emscripten_glDeleteFramebuffers;
    var yf = env._emscripten_glUniform4fv;
    var zf = env.genericPointerToWireType;
    var Af = env.registerType;
    var Bf = env.___cxa_throw;
    var Cf = env._emscripten_set_main_loop;
    var Df = env._emscripten_glClearColor;
    var Ef = env._emscripten_glGetShaderSource;
    var Ff = env._emscripten_glCreateProgram;
    var Gf = env._emscripten_glValidateProgram;
    var Hf = env.requireFunction;
    var If = env._emscripten_glUniform2fv;
    var Jf = env.__formatString;
    var Kf = env._emscripten_glGetFloatv;
    var Lf = env._emscripten_glDetachShader;
    var Mf = env._emscripten_glColorMask;
    var Nf = env._emscripten_glEnableClientState;
    var Of = env.RegisteredClass;
    var Pf = env._emscripten_glBindTexture;
    var Qf = env._emscripten_glTexImage2D;
    var Rf = 0.0;
    // EMSCRIPTEN_START_FUNCS
    function qg(a) {
        a = a | 0;
        var b = 0;
        b = i;
        i = (i + a) | 0;
        i = (i + 15) & -16;
        return b | 0;
    }
    function rg() {
        return i | 0;
    }
    function sg(a) {
        a = a | 0;
        i = a;
    }
    function tg(a, b) {
        a = a | 0;
        b = b | 0;
        if (!p) {
            p = a;
            q = b;
        }
    }
    function ug(b) {
        b = b | 0;
        a[k >> 0] = a[b >> 0];
        a[(k + 1) >> 0] = a[(b + 1) >> 0];
        a[(k + 2) >> 0] = a[(b + 2) >> 0];
        a[(k + 3) >> 0] = a[(b + 3) >> 0];
    }
    function vg(b) {
        b = b | 0;
        a[k >> 0] = a[b >> 0];
        a[(k + 1) >> 0] = a[(b + 1) >> 0];
        a[(k + 2) >> 0] = a[(b + 2) >> 0];
        a[(k + 3) >> 0] = a[(b + 3) >> 0];
        a[(k + 4) >> 0] = a[(b + 4) >> 0];
        a[(k + 5) >> 0] = a[(b + 5) >> 0];
        a[(k + 6) >> 0] = a[(b + 6) >> 0];
        a[(k + 7) >> 0] = a[(b + 7) >> 0];
    }
    function wg(a) {
        a = a | 0;
        E = a;
    }
    function xg() {
        return E | 0;
    }
    function yg(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0;
        d = i;
        e = c[(b + 4) >> 2] | 0;
        f = c[(a + 4) >> 2] | 0;
        if ((e | 0) == (f | 0))
            if ((c[(b + 8) >> 2] | 0) > (c[(a + 8) >> 2] | 0)) {
                c[(a + 28) >> 2] = b;
                c[(b + 36) >> 2] = a;
                i = d;
                return;
            } else {
                c[(a + 36) >> 2] = b;
                c[(b + 28) >> 2] = a;
                i = d;
                return;
            }
        else if ((e | 0) < (f | 0)) {
            c[(a + 40) >> 2] = b;
            c[(b + 32) >> 2] = a;
            i = d;
            return;
        } else {
            c[(a + 32) >> 2] = b;
            c[(b + 40) >> 2] = a;
            i = d;
            return;
        }
    }
    function zg(b, d, e) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            h = 0,
            j = 0,
            k = 0;
        f = i;
        c[(b + 12) >> 2] = 0;
        c[(b + 16) >> 2] = 0;
        c[(b + 20) >> 2] = 0;
        c[(b + 28) >> 2] = 0;
        c[(b + 32) >> 2] = 0;
        c[(b + 36) >> 2] = 0;
        g[(b + 24) >> 2] = 0.5;
        Bh((b + 40) | 0);
        c[(b + 80) >> 2] = 0;
        c[(b + 84) >> 2] = 0;
        c[(b + 124) >> 2] = 0;
        c[(b + 128) >> 2] = 0;
        c[(b + 136) >> 2] = 0;
        c[(b + 140) >> 2] = 0;
        c[(b + 144) >> 2] = 0;
        c[b >> 2] = d;
        c[(b + 4) >> 2] = e;
        h = (b + 8) | 0;
        c[h >> 2] = uj(d >>> 0 > 1073741823 ? -1 : d << 2) | 0;
        if ((d | 0) > 0) {
            j = 0;
            do {
                k = tj(12) | 0;
                c[k >> 2] = 0;
                c[(k + 4) >> 2] = 0;
                c[(k + 8) >> 2] = 0;
                c[((c[h >> 2] | 0) + (j << 2)) >> 2] = k;
                j = (j + 1) | 0;
            } while ((j | 0) < (d | 0));
        }
        c[(b + 44) >> 2] = 0;
        c[(b + 48) >> 2] = ((e * 200) | 0) + -200;
        c[(b + 132) >> 2] = 0;
        c[(b + 100) >> 2] = 0;
        c[(b + 104) >> 2] = 0;
        c[(b + 112) >> 2] = 0;
        g[(b + 52) >> 2] = 1.0;
        a[(b + 56) >> 0] = 0;
        a[(b + 108) >> 0] = 0;
        c[(b + 92) >> 2] = 0;
        c[(b + 96) >> 2] = 0;
        a[(b + 57) >> 0] = 1;
        a[(b + 58) >> 0] = 0;
        a[(b + 59) >> 0] = 0;
        c[(b + 60) >> 2] = 20;
        a[(b + 64) >> 0] = 1;
        e = (b + 65) | 0;
        c[(b + 116) >> 2] = 0;
        c[(b + 120) >> 2] = 0;
        a[(e + 0) >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        a[(e + 4) >> 0] = 0;
        a[(e + 5) >> 0] = 0;
        a[(e + 6) >> 0] = 0;
        i = f;
        return;
    }
    function Ag(a) {
        a = a | 0;
        var b = 0,
            d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0;
        b = i;
        d = (a + 12) | 0;
        gh(d);
        e = (a + 8) | 0;
        f = c[e >> 2] | 0;
        if ((c[a >> 2] | 0) > 0) {
            g = f;
            h = 0;
            while (1) {
                hh(c[(g + (h << 2)) >> 2] | 0);
                h = (h + 1) | 0;
                j = c[e >> 2] | 0;
                if ((h | 0) >= (c[a >> 2] | 0)) {
                    k = j;
                    break;
                } else g = j;
            }
        } else k = f;
        if (k) wj(k);
        k = c[(a + 116) >> 2] | 0;
        if (k) {
            wh(c[k >> 2] | 0);
            vj(k);
        }
        k = c[(a + 120) >> 2] | 0;
        if (k) {
            th(c[k >> 2] | 0);
            vj(k);
        }
        ik(c[(a + 136) >> 2] | 0);
        ik(c[(a + 28) >> 2] | 0);
        ik(c[d >> 2] | 0);
        i = b;
        return;
    }
    function Bg(b, d) {
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        c[(b + 100) >> 2] = d;
        c[(b + 104) >> 2] = d;
        if ((d | 0) <= -1) {
            f = (b + 44) | 0;
            c[f >> 2] = 0;
            i = e;
            return;
        }
        Cg(b);
        Cg(b);
        if ((d | 0) > 9) {
            g = (b + 58) | 0;
            if (!(a[g >> 0] | 0)) Cg(b);
            if ((d | 0) > 14 ? (a[g >> 0] | 0) == 0 : 0) Cg(b);
        }
        if ((d | 0) <= 3) {
            f = (b + 44) | 0;
            c[f >> 2] = 0;
            i = e;
            return;
        }
        g = (b + 40) | 0;
        h = Ch(g) | 0;
        j = (h >>> 0) % ((c[b >> 2] | 0) >>> 0) | 0;
        h = Ch(g) | 0;
        g = c[((c[(b + 8) >> 2] | 0) + (j << 2)) >> 2] | 0;
        c[c[((c[g >> 2] | 0) + (((h >>> 0) % ((c[(g + 4) >> 2] | 0) >>> 0) | 0) << 2)) >> 2] >> 2] = d;
        f = (b + 44) | 0;
        c[f >> 2] = 0;
        i = e;
        return;
    }
    function Cg(b) {
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0;
        d = i;
        e = (b + 56) | 0;
        if (!(a[e >> 0] | 0)) {
            f = (b + 44) | 0;
            c[f >> 2] = (c[f >> 2] | 0) + -200;
        } else {
            f = (b + 48) | 0;
            c[f >> 2] = (c[f >> 2] | 0) + 200;
        }
        f = c[b >> 2] | 0;
        if ((f | 0) > 0) {
            g = 0;
            do {
                Zg(b, g);
                h = c[b >> 2] | 0;
                g = (g + 1) | 0;
            } while ((g | 0) < (h | 0));
            j = h;
        } else j = f;
        f = $g(b) | 0;
        if ((f | 0) <= 1) {
            i = d;
            return;
        }
        if ((j | 0) > 0) {
            g = (b + 40) | 0;
            h = (b + 8) | 0;
            k = (b + 44) | 0;
            l = (b + 48) | 0;
            m = 0;
            do {
                n = ((Ch(g) | 0) >>> 0) % 100 | 0;
                o = c[((c[h >> 2] | 0) + (m << 2)) >> 2] | 0;
                if (!(a[e >> 0] | 0)) p = c[o >> 2] | 0;
                else p = ih(o) | 0;
                o = c[p >> 2] | 0;
                if (n >>> 0 < 33) {
                    if ((m | 0) >= 1) {
                        q = c[((c[h >> 2] | 0) + ((m + -1) << 2)) >> 2] | 0;
                        if (!(a[e >> 0] | 0)) r = c[q >> 2] | 0;
                        else r = ih(q) | 0;
                        s = c[r >> 2] | 0;
                        t = 24;
                    }
                } else if (n >>> 0 < 66 ? ((n = c[((c[h >> 2] | 0) + (m << 2)) >> 2] | 0), (q = c[(n + 4) >> 2] | 0), (q | 0) > 1) : 0) {
                    if (!(a[e >> 0] | 0)) {
                        u = ((c[n >> 2] | 0) + 4) | 0;
                        v = ((c[k >> 2] | 0) + 200) | 0;
                    } else {
                        u = ((c[n >> 2] | 0) + ((q + -2) << 2)) | 0;
                        v = ((c[l >> 2] | 0) + -200) | 0;
                    }
                    q = c[u >> 2] | 0;
                    if ((c[(q + 8) >> 2] | 0) == (v | 0)) {
                        s = q;
                        t = 24;
                    }
                }
                do
                    if ((t | 0) == 24 ? ((t = 0), (s | 0) != 0) : 0) {
                        q = c[(s + 44) >> 2] | 0;
                        n = c[(o + 44) >> 2] | 0;
                        if ((q | 0) != (n | 0)) {
                            if ((((c[(n + 4) >> 2] | 0) + (c[(q + 4) >> 2] | 0)) | 0) > (f | 0)) break;
                            if (ah(n, q) | 0) break;
                        }
                        bh(b, o, s);
                    }
                while (0);
                m = (m + 1) | 0;
                o = c[b >> 2] | 0;
            } while ((m | 0) < (o | 0));
            w = o;
        } else w = j;
        if (!(a[(b + 65) >> 0] | 0)) {
            i = d;
            return;
        }
        j = (b + 8) | 0;
        m = (b + 40) | 0;
        s = w;
        w = 0;
        while (1) {
            if ((s | 0) > 0) {
                f = 0;
                t = 0;
                while (1) {
                    v = c[((c[j >> 2] | 0) + (f << 2)) >> 2] | 0;
                    if (!(a[e >> 0] | 0)) x = c[v >> 2] | 0;
                    else x = ih(v) | 0;
                    v = c[x >> 2] | 0;
                    u = c[(v + 44) >> 2] | 0;
                    l = (u + 4) | 0;
                    k = ((c[l >> 2] | 0) + -1) | 0;
                    h = (k | 0) < 2 ? k : 2;
                    if (!(((Ch(m) | 0) >>> 0) % 3 | 0)) {
                        k = c[l >> 2] | 0;
                        if ((k | 0) > 0) {
                            l = c[u >> 2] | 0;
                            u = 0;
                            r = 0;
                            while (1) {
                                p = ((((c[c[(l + (r << 2)) >> 2] >> 2] | 0) == -1) & 1) + u) | 0;
                                r = (r + 1) | 0;
                                if ((r | 0) == (k | 0)) {
                                    y = p;
                                    break;
                                } else u = p;
                            }
                        } else y = 0;
                        if ((y | 0) < (h | 0)) {
                            c[v >> 2] = -1;
                            z = 1;
                        } else z = t;
                    } else z = t;
                    f = (f + 1) | 0;
                    u = c[b >> 2] | 0;
                    if ((f | 0) >= (u | 0)) {
                        A = u;
                        B = z;
                        break;
                    } else t = z;
                }
            } else {
                A = s;
                B = 0;
            }
            if (((w | 0) > 0) | B) break;
            else {
                s = A;
                w = (w + 1) | 0;
            }
        }
        i = d;
        return;
    }
    function Dg(a, b) {
        a = a | 0;
        b = b | 0;
        c[a >> 2] = b;
        c[(a + 4) >> 2] = 0;
        c[(a + 8) >> 2] = -1;
        return;
    }
    function Eg(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0;
        e = i;
        f = (d + 4) | 0;
        g = c[f >> 2] | 0;
        h = c[(f + 4) >> 2] | 0;
        f = c[(b + 132) >> 2] | 0;
        if ((f | 0) != 0 ? ((j = c[(d + 44) >> 2] | 0), (j | 0) == (c[(f + 44) >> 2] | 0)) : 0) {
            d = ((c[(b + 124) >> 2] | 0) + -100) | 0;
            k = (f + 4) | 0;
            f = c[k >> 2] | 0;
            l = (d - f) | 0;
            m = ((c[(b + 128) >> 2] | 0) + -100 - (c[(k + 4) >> 2] | 0)) | 0;
            if ((d | 0) == (f | 0)) n = g;
            else {
                f = (Fg(b, j, (l | 0) > 0 ? 1 : -1, 0) | 0) == 9999999;
                if ((l | 0) < -100) o = -100;
                else o = (l | 0) > 100 ? 100 : l;
                if (f) p = ((o | 0) / 6) | 0;
                else p = o;
                n = (p + g) | 0;
            }
            if ((m | 0) < -33) q = -16;
            else q = (m | 0) > 33 ? 16 : ((m | 0) / 2) | 0;
            r = n;
            s = (q + h) | 0;
        } else {
            r = g;
            s = h;
        }
        c[a >> 2] = r + 100;
        c[(a + 4) >> 2] = s + 100;
        i = e;
        return;
    }
    function Fg(a, b, d, e) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0,
            C = 0,
            D = 0,
            E = 0,
            F = 0,
            G = 0,
            H = 0,
            I = 0;
        f = i;
        if (!d) {
            g = 0;
            i = f;
            return g | 0;
        }
        h = c[(b + 4) >> 2] | 0;
        if (!h) {
            g = 0;
            i = f;
            return g | 0;
        }
        j = c[b >> 2] | 0;
        k = (e | 0) > -1;
        l = (a + 8) | 0;
        m = 0;
        n = 0;
        o = 0;
        a: while (1) {
            p = c[(j + (n << 2)) >> 2] | 0;
            q = ((((c[(p + 4) >> 2] | 0) / 200) | 0) + d) | 0;
            if ((q | 0) < 0) {
                g = 9999999;
                r = 27;
                break;
            }
            if ((q | 0) >= (c[a >> 2] | 0)) {
                g = 9999999;
                r = 27;
                break;
            }
            s = c[((c[l >> 2] | 0) + (q << 2)) >> 2] | 0;
            q = c[(s + 4) >> 2] | 0;
            b: do
                if (k)
                    if ((q | 0) > 0) {
                        t = (p + 8) | 0;
                        u = c[s >> 2] | 0;
                        v = m;
                        w = 0;
                        x = o;
                        while (1) {
                            y = c[(u + (w << 2)) >> 2] | 0;
                            do
                                if ((c[(y + 44) >> 2] | 0) != (b | 0)) {
                                    z = c[y >> 2] | 0;
                                    if ((z | 0) > 0 ? (z | 0) == (c[p >> 2] | 0) : 0) {
                                        A = v;
                                        B = x;
                                        break;
                                    }
                                    z = c[(y + 8) >> 2] | 0;
                                    C = (z + 200) | 0;
                                    D = c[t >> 2] | 0;
                                    E = (D + x) | 0;
                                    if ((C | 0) > (E | 0)) {
                                        if ((z | 0) >= ((E + 200) | 0)) {
                                            F = v;
                                            G = x;
                                            break b;
                                        }
                                        E = (C - D) | 0;
                                        if ((E | 0) > (e | 0)) {
                                            g = 9999999;
                                            r = 27;
                                            break a;
                                        } else {
                                            A = 0;
                                            B = E;
                                        }
                                    } else {
                                        A = v;
                                        B = x;
                                    }
                                } else {
                                    A = v;
                                    B = x;
                                }
                            while (0);
                            w = (w + 1) | 0;
                            if ((w | 0) >= (q | 0)) {
                                F = A;
                                G = B;
                                break;
                            } else {
                                v = A;
                                x = B;
                            }
                        }
                    } else {
                        F = m;
                        G = o;
                    }
                else {
                    x = (p + 8) | 0;
                    v = m;
                    w = q;
                    t = o;
                    while (1) {
                        if ((w | 0) <= 0) {
                            F = v;
                            G = t;
                            break b;
                        }
                        u = c[s >> 2] | 0;
                        y = w;
                        c: while (1) {
                            y = (y + -1) | 0;
                            E = c[(u + (y << 2)) >> 2] | 0;
                            do
                                if ((c[(E + 44) >> 2] | 0) != (b | 0)) {
                                    D = c[E >> 2] | 0;
                                    if ((D | 0) > 0 ? (D | 0) == (c[p >> 2] | 0) : 0) break;
                                    H = c[(E + 8) >> 2] | 0;
                                    I = c[x >> 2] | 0;
                                    D = (I + t) | 0;
                                    if (((H + 200) | 0) <= (D | 0)) {
                                        F = v;
                                        G = t;
                                        break b;
                                    }
                                    if ((H | 0) < ((D + 200) | 0)) break c;
                                }
                            while (0);
                            if ((y | 0) <= 0) {
                                F = v;
                                G = t;
                                break b;
                            }
                        }
                        t = (H + -200 - I) | 0;
                        if ((t | 0) < (e | 0)) {
                            g = 9999999;
                            r = 27;
                            break a;
                        } else {
                            v = 0;
                            w = y;
                        }
                    }
                }
            while (0);
            m = (F + 1) | 0;
            if ((m | 0) == (h | 0)) {
                g = G;
                r = 27;
                break;
            } else {
                n = ((n + 1) | 0) % (h | 0) | 0;
                o = G;
            }
        }
        if ((r | 0) == 27) {
            i = f;
            return g | 0;
        }
        return 0;
    }
    function Gg(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0;
        d = i;
        e = c[b >> 2] | 0;
        f = ((e | 0) / 200) | 0;
        if ((e | 0) < -199) {
            g = 0;
            i = d;
            return g | 0;
        }
        if ((f | 0) >= (c[a >> 2] | 0)) {
            g = 0;
            i = d;
            return g | 0;
        }
        e = c[((c[(a + 8) >> 2] | 0) + (f << 2)) >> 2] | 0;
        f = c[(e + 4) >> 2] | 0;
        if (!f) {
            g = 0;
            i = d;
            return g | 0;
        }
        do
            if ((f | 0) > 0) {
                a = c[(b + 4) >> 2] | 0;
                h = c[e >> 2] | 0;
                j = 0;
                k = 0;
                l = 0;
                while (1) {
                    m = c[(h + (l << 2)) >> 2] | 0;
                    n = c[(m + 8) >> 2] | 0;
                    o = (n + 200) | 0;
                    if (((n | 0) <= (a | 0)) & ((a | 0) < (o | 0))) {
                        g = m;
                        p = 10;
                        break;
                    }
                    q = (n | 0) > (a | 0) ? (n - a) | 0 : (a - o) | 0;
                    o = ((k | 0) == 0) | ((q | 0) < (j | 0));
                    j = o ? q : j;
                    k = o ? m : k;
                    l = (l + 1) | 0;
                    if ((l | 0) >= (f | 0)) {
                        p = 8;
                        break;
                    }
                }
                if ((p | 0) == 8) {
                    r = (j | 0) < 100;
                    s = k;
                    break;
                } else if ((p | 0) == 10) {
                    i = d;
                    return g | 0;
                }
            } else {
                r = 1;
                s = 0;
            }
        while (0);
        g = ((s | 0) != 0) & r ? s : 0;
        i = d;
        return g | 0;
    }
    function Hg(b) {
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0;
        d = i;
        do
            if (!(c[(b + 132) >> 2] | 0)) {
                if ((a[(b + 57) >> 0] | 0) == 0 ? ((e = c[(b + 68) >> 2] | 0), ((e | 0) == 1) | ((e | 0) == 3)) : 0) {
                    f = 1;
                    break;
                }
                f = 0;
            } else f = 1;
        while (0);
        i = d;
        return f | 0;
    }
    function Ig(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0;
        d = i;
        e = (a + 132) | 0;
        if (c[e >> 2] | 0) {
            f = qd(4) | 0;
            c[f >> 2] = 8;
            Bf(f | 0, 4840, 0);
        }
        c[e >> 2] = b;
        Jg(a, (a + 136) | 0);
        e = c[(a + 116) >> 2] | 0;
        if (!e) {
            i = d;
            return;
        }
        f = (b + 4) | 0;
        xh(e, c[(a + 96) >> 2] | 0, c[f >> 2] | 0, c[(f + 4) >> 2] | 0);
        i = d;
        return;
    }
    function Jg(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0;
        d = i;
        e = (b + 4) | 0;
        c[e >> 2] = 0;
        if ((c[a >> 2] | 0) <= 0) {
            i = d;
            return;
        }
        f = (a + 8) | 0;
        g = 0;
        do {
            h = c[((c[f >> 2] | 0) + (g << 2)) >> 2] | 0;
            if ((c[(h + 4) >> 2] | 0) > 0) {
                j = h;
                h = 0;
                do {
                    k = c[((c[j >> 2] | 0) + (h << 2)) >> 2] | 0;
                    jh(b, ((c[e >> 2] | 0) + 1) | 0);
                    l = c[k >> 2] | 0;
                    k = c[e >> 2] | 0;
                    c[e >> 2] = k + 1;
                    c[((c[b >> 2] | 0) + (k << 2)) >> 2] = l;
                    h = (h + 1) | 0;
                    j = c[((c[f >> 2] | 0) + (g << 2)) >> 2] | 0;
                } while ((h | 0) < (c[(j + 4) >> 2] | 0));
            }
            jh(b, ((c[e >> 2] | 0) + 1) | 0);
            j = c[e >> 2] | 0;
            c[e >> 2] = j + 1;
            c[((c[b >> 2] | 0) + (j << 2)) >> 2] = 0;
            g = (g + 1) | 0;
        } while ((g | 0) < (c[a >> 2] | 0));
        i = d;
        return;
    }
    function Kg(b) {
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        d = i;
        i = (i + 16) | 0;
        e = d;
        f = (b + 132) | 0;
        g = c[f >> 2] | 0;
        if (!g) {
            i = d;
            return;
        }
        h = c[(b + 116) >> 2] | 0;
        if (!h) j = g;
        else {
            zh(h, c[(b + 96) >> 2] | 0);
            j = c[f >> 2] | 0;
        }
        if (Lg(b, c[(j + 44) >> 2] | 0) | 0) c[((c[((c[f >> 2] | 0) + 44) >> 2] | 0) + 12) >> 2] = 0;
        else c[((c[((c[f >> 2] | 0) + 44) >> 2] | 0) + 12) >> 2] = (a[(b + 56) >> 0] | 0) != 0 ? 30 : -30;
        c[f >> 2] = 0;
        c[e >> 2] = 0;
        f = (e + 4) | 0;
        c[f >> 2] = 0;
        c[(e + 8) >> 2] = 0;
        Jg(b, e);
        j = c[f >> 2] | 0;
        a: do
            if ((j | 0) == (c[(b + 140) >> 2] | 0)) {
                if ((j | 0) > 0) {
                    f = c[e >> 2] | 0;
                    h = c[(b + 136) >> 2] | 0;
                    g = 0;
                    while (1) {
                        if ((c[(f + (g << 2)) >> 2] | 0) != (c[(h + (g << 2)) >> 2] | 0)) break;
                        g = (g + 1) | 0;
                        if ((g | 0) >= (j | 0)) break a;
                    }
                    Mg(b);
                }
            } else Mg(b);
        while (0);
        ik(c[e >> 2] | 0);
        i = d;
        return;
    }
    function Lg(b, d) {
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0;
        e = i;
        i = (i + 16) | 0;
        f = (e + 4) | 0;
        g = e;
        h = (d + 16) | 0;
        j = c[h >> 2] | 0;
        if (!j) {
            k = (d + 4) | 0;
            a: do
                if ((c[k >> 2] | 0) > 0) {
                    l = (b + 56) | 0;
                    m = (b + 44) | 0;
                    n = (b + 8) | 0;
                    o = (b + 48) | 0;
                    p = 0;
                    b: while (1) {
                        q = c[((c[d >> 2] | 0) + (p << 2)) >> 2] | 0;
                        fh(b, q, f, g) | 0;
                        r = c[g >> 2] | 0;
                        do
                            if (!(a[l >> 0] | 0)) {
                                if (!r)
                                    if ((c[(q + 8) >> 2] | 0) > (c[m >> 2] | 0)) break;
                                    else break b;
                                s = c[f >> 2] | 0;
                                t = (r + -1) | 0;
                                if (((s | 0) > -1 ? ((r | 0) > 0 ? (c[b >> 2] | 0) > (s | 0) : 0) : 0) ? ((u = c[((c[n >> 2] | 0) + (s << 2)) >> 2] | 0), (c[(u + 4) >> 2] | 0) > (t | 0)) : 0) v = c[((c[u >> 2] | 0) + (t << 2)) >> 2] | 0;
                                else v = 0;
                                t = c[(v + 44) >> 2] | 0;
                                if ((t | 0) != (d | 0) ? Lg(b, t) | 0 : 0) {
                                    t = c[q >> 2] | 0;
                                    if ((t | 0) > 0) w = (t | 0) == (c[v >> 2] | 0) ? 0 : 200;
                                    else w = 200;
                                    if ((c[(q + 8) >> 2] | 0) <= ((w + (c[(v + 8) >> 2] | 0)) | 0)) break b;
                                }
                            } else {
                                t = c[f >> 2] | 0;
                                u = c[((c[n >> 2] | 0) + (t << 2)) >> 2] | 0;
                                s = c[(u + 4) >> 2] | 0;
                                if ((r | 0) == ((s + -1) | 0))
                                    if ((c[(q + 8) >> 2] | 0) < (c[o >> 2] | 0)) break;
                                    else break b;
                                x = (r + 1) | 0;
                                if ((t | 0) > -1 ? ((r | 0) > -2 ? (c[b >> 2] | 0) > (t | 0) : 0) & ((s | 0) > (x | 0)) : 0) y = c[((c[u >> 2] | 0) + (x << 2)) >> 2] | 0;
                                else y = 0;
                                x = c[(y + 44) >> 2] | 0;
                                if ((x | 0) != (d | 0) ? Lg(b, x) | 0 : 0) {
                                    x = c[q >> 2] | 0;
                                    if ((x | 0) > 0) z = (x | 0) == (c[y >> 2] | 0) ? 0 : 200;
                                    else z = 200;
                                    if ((c[(q + 8) >> 2] | 0) >= (((c[(y + 8) >> 2] | 0) - z) | 0)) break b;
                                }
                            }
                        while (0);
                        p = (p + 1) | 0;
                        if ((p | 0) >= (c[k >> 2] | 0)) break a;
                    }
                    c[h >> 2] = 1;
                    A = 1;
                    i = e;
                    return A | 0;
                }
            while (0);
            c[h >> 2] = 2;
            B = 2;
        } else B = j;
        A = (B | 0) == 1;
        i = e;
        return A | 0;
    }
    function Mg(a) {
        a = a | 0;
        var b = 0,
            d = 0,
            e = 0;
        b = i;
        d = (a + 92) | 0;
        c[d >> 2] = (c[d >> 2] | 0) + 1;
        if ((c[(a + 68) >> 2] | 0) != 1) {
            i = b;
            return;
        }
        d = ((c[(a + 104) >> 2] | 0) - (c[(a + 60) >> 2] | 0) + 1) | 0;
        e = (a + 52) | 0;
        g[e >> 2] = +g[e >> 2] - ((d | 0) < 0 ? 0.16666666666666666 : 1.0 / (6.0 - +(d | 0) * 0.25));
        i = b;
        return;
    }
    function Ng(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0;
        d = i;
        e = b;
        b = c[e >> 2] | 0;
        f = c[(e + 4) >> 2] | 0;
        e = (a + 124) | 0;
        c[e >> 2] = b;
        c[(e + 4) >> 2] = f;
        e = c[(a + 116) >> 2] | 0;
        if (!e) {
            i = d;
            return;
        }
        yh(e, c[(a + 96) >> 2] | 0, b, f);
        i = d;
        return;
    }
    function Og(b) {
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0,
            C = 0,
            D = 0,
            E = 0,
            F = 0,
            G = 0,
            H = 0,
            I = 0,
            J = 0,
            K = 0,
            L = 0,
            M = 0,
            N = 0,
            O = 0,
            P = 0,
            Q = 0,
            R = 0,
            S = 0,
            T = 0,
            U = 0,
            V = 0,
            W = 0,
            X = 0,
            Y = 0,
            Z = 0,
            _ = 0,
            $ = 0,
            aa = 0,
            ba = 0,
            ca = 0,
            da = 0.0,
            ea = 0.0,
            fa = 0,
            ga = 0,
            ha = 0,
            ia = 0,
            ja = 0,
            ka = 0,
            la = 0,
            ma = 0,
            na = 0,
            oa = 0;
        d = i;
        i = (i + 224) | 0;
        e = (d + 48) | 0;
        f = (d + 16) | 0;
        h = (d + 192) | 0;
        j = (d + 196) | 0;
        k = (d + 184) | 0;
        l = (d + 8) | 0;
        m = d;
        n = (d + 40) | 0;
        o = (d + 24) | 0;
        p = (d + 168) | 0;
        q = (d + 208) | 0;
        r = (b + 120) | 0;
        s = c[r >> 2] | 0;
        if ((s | 0) != 0 ? ((t = (b + 96) | 0), (u = uh(s, c[t >> 2] | 0) | 0), (u | 0) != 0) : 0) {
            s = (b + 124) | 0;
            v = u;
            do {
                u = c[(v + 4) >> 2] | 0;
                if ((u | 0) == 1) {
                    w = (v + 8) | 0;
                    x = c[(w + 4) >> 2] | 0;
                    y = s;
                    c[y >> 2] = c[w >> 2];
                    c[(y + 4) >> 2] = x;
                } else if (!u) {
                    x = (v + 8) | 0;
                    y = c[(x + 4) >> 2] | 0;
                    w = f;
                    c[w >> 2] = c[x >> 2];
                    c[(w + 4) >> 2] = y;
                    c[(e + 0) >> 2] = c[(f + 0) >> 2];
                    c[(e + 4) >> 2] = c[(f + 4) >> 2];
                    y = Gg(b, e) | 0;
                    if (y) Ig(b, y);
                } else if ((u | 0) == 2) Kg(b);
                v = uh(c[r >> 2] | 0, c[t >> 2] | 0) | 0;
            } while ((v | 0) != 0);
        }
        v = (b + 72) | 0;
        t = (b + 74) | 0;
        r = (b + 75) | 0;
        f = (b + 76) | 0;
        a[v >> 0] = 0;
        a[(v + 1) >> 0] = 0;
        a[(v + 2) >> 0] = 0;
        a[(v + 3) >> 0] = 0;
        c[f >> 2] = -1;
        c[(b + 88) >> 2] = c[(b + 100) >> 2];
        c[h >> 2] = 5;
        s = (b + 44) | 0;
        Ah(0, s, h);
        c[h >> 2] = 5;
        u = (b + 4) | 0;
        Ah(((((c[u >> 2] | 0) * 200) | 0) + -200) | 0, (b + 48) | 0, h);
        h = (b + 112) | 0;
        y = c[h >> 2] | 0;
        w = (y | 0) == 0;
        x = (b + 24) | 0;
        g[x >> 2] = w ? -0.5 : 0.5;
        z = (b + 108) | 0;
        if (a[z >> 0] | 0) {
            i = d;
            return;
        }
        if (!w ? (a[(y + 108) >> 0] | 0) != 0 : 0) {
            i = d;
            return;
        }
        y = (b + 96) | 0;
        c[y >> 2] = (c[y >> 2] | 0) + 1;
        y = (b + 57) | 0;
        a[y >> 0] = 1;
        w = (b + 132) | 0;
        A = c[w >> 2] | 0;
        if (A) {
            a[y >> 0] = 0;
            B = ((c[(b + 128) >> 2] | 0) + -100 - (c[(A + 8) >> 2] | 0)) | 0;
            C = ((c[(A + 4) >> 2] | 0) / 200) | 0;
            D = ((c[b >> 2] | 0) + -1) | 0;
            E = c[(b + 124) >> 2] | 0;
            F = ((E | 0) / 200) | 0;
            if ((E | 0) < -199) G = 0;
            else G = (F | 0) > (D | 0) ? D : F;
            F = c[(A + 44) >> 2] | 0;
            A = Pg(b, F, B) | 0;
            if ((C | 0) == (G | 0)) {
                H = F;
                I = A;
            } else {
                D = (G | 0) < (C | 0) ? -1 : 1;
                C = Fg(b, F, D, A) | 0;
                G = c[(F + 4) >> 2] | 0;
                E = (G | 0) > 0;
                do
                    if ((C | 0) == 9999999) {
                        if (E) {
                            J = c[F >> 2] | 0;
                            K = 0;
                            do {
                                L = ((c[(J + (K << 2)) >> 2] | 0) + 8) | 0;
                                c[L >> 2] = (c[L >> 2] | 0) + A;
                                K = (K + 1) | 0;
                            } while ((K | 0) != (G | 0));
                        }
                        K = (B - A) | 0;
                        J = Fg(b, F, D, Pg(b, F, -100) | 0) | 0;
                        L = Fg(b, F, D, Pg(b, F, 100) | 0) | 0;
                        if ((J | 0) != 9999999) {
                            if (E) {
                                M = c[F >> 2] | 0;
                                N = 0;
                                do {
                                    O = ((c[(M + (N << 2)) >> 2] | 0) + 8) | 0;
                                    c[O >> 2] = (c[O >> 2] | 0) + J;
                                    N = (N + 1) | 0;
                                } while ((N | 0) != (G | 0));
                            }
                            Qg(b, F, D);
                            P = K;
                            break;
                        }
                        if ((L | 0) == 9999999) P = K;
                        else {
                            if (E) {
                                N = c[F >> 2] | 0;
                                J = 0;
                                do {
                                    M = ((c[(N + (J << 2)) >> 2] | 0) + 8) | 0;
                                    c[M >> 2] = (c[M >> 2] | 0) + L;
                                    J = (J + 1) | 0;
                                } while ((J | 0) != (G | 0));
                            }
                            Qg(b, F, D);
                            P = K;
                        }
                    } else {
                        if (E) {
                            J = c[F >> 2] | 0;
                            L = 0;
                            do {
                                N = ((c[(J + (L << 2)) >> 2] | 0) + 8) | 0;
                                c[N >> 2] = (c[N >> 2] | 0) + C;
                                L = (L + 1) | 0;
                            } while ((L | 0) != (G | 0));
                        }
                        Qg(b, F, D);
                        P = (B - C) | 0;
                    }
                while (0);
                C = c[((c[w >> 2] | 0) + 44) >> 2] | 0;
                H = C;
                I = Pg(b, C, P) | 0;
            }
            P = c[(H + 4) >> 2] | 0;
            if ((P | 0) > 0) {
                C = c[H >> 2] | 0;
                H = 0;
                do {
                    w = ((c[(C + (H << 2)) >> 2] | 0) + 8) | 0;
                    c[w >> 2] = (c[w >> 2] | 0) + I;
                    H = (H + 1) | 0;
                } while ((H | 0) != (P | 0));
            }
        }
        P = (b + 16) | 0;
        H = c[P >> 2] | 0;
        I = (b + 12) | 0;
        if ((H | 0) > 0) {
            C = c[I >> 2] | 0;
            w = 0;
            do {
                c[((c[(C + (w << 2)) >> 2] | 0) + 20) >> 2] = 0;
                w = (w + 1) | 0;
            } while ((w | 0) < (H | 0));
            Q = H;
            R = 1;
            S = 0;
        } else {
            Q = H;
            R = 1;
            S = 0;
        }
        a: while (1) {
            H = R;
            w = S;
            while (1) {
                if ((w | 0) < (Q | 0)) break;
                if (!(H & 1)) {
                    H = 1;
                    w = 0;
                } else break a;
            }
            C = Rg(b, c[((c[I >> 2] | 0) + (w << 2)) >> 2] | 0) | 0;
            Q = c[P >> 2] | 0;
            R = C ? 0 : H;
            S = (w + 1) | 0;
        }
        c[j >> 2] = b;
        S = (j + 4) | 0;
        c[S >> 2] = 0;
        R = (j + 8) | 0;
        c[R >> 2] = -1;
        if (kh(j) | 0)
            do {
                Q = c[((c[c[((c[((c[j >> 2] | 0) + 8) >> 2] | 0) + (c[S >> 2] << 2)) >> 2] >> 2] | 0) + (c[R >> 2] << 2)) >> 2] | 0;
                C = c[((c[(Q + 44) >> 2] | 0) + 20) >> 2] | 0;
                if (C) a[y >> 0] = 0;
                B = (Q + 8) | 0;
                c[B >> 2] = (c[B >> 2] | 0) + C;
            } while (kh(j) | 0);
        j = c[b >> 2] | 0;
        if ((j | 0) > 0) {
            R = (b + 8) | 0;
            S = (k + 4) | 0;
            C = (b + 80) | 0;
            B = (b + 60) | 0;
            Q = (n + 4) | 0;
            D = c[R >> 2] | 0;
            F = j;
            j = 0;
            G = 0;
            while (1) {
                E = c[(D + (G << 2)) >> 2] | 0;
                if ((c[(E + 4) >> 2] | 0) > 0) {
                    A = (j + -1) | 0;
                    L = F;
                    J = E;
                    E = 0;
                    while (1) {
                        if (((E | 0) < 0) | ((L | 0) <= (G | 0))) T = 0;
                        else T = c[((c[J >> 2] | 0) + (E << 2)) >> 2] | 0;
                        do
                            if (
                                (
                                    (
                                        (((E | 0) == 0 ? ((K = c[h >> 2] | 0), (K | 0) != 0) : 0) ? (c[(T + 8) >> 2] | 0) == (c[s >> 2] | 0) : 0)
                                            ? ((N = c[((c[(T + 44) >> 2] | 0) + 12) >> 2] | 0), (((N | 0) > -1 ? N : (0 - N) | 0) | 0) > 10)
                                            : 0
                                    )
                                        ? ((N = (A + L) | 0), (N | 0) > -1)
                                        : 0
                                )
                                    ? (c[K >> 2] | 0) > (N | 0)
                                    : 0
                            ) {
                                M = c[((c[(K + 8) >> 2] | 0) + (N << 2)) >> 2] | 0;
                                if ((c[(M + 4) >> 2] | 0) <= 0) break;
                                N = c[c[M >> 2] >> 2] | 0;
                                if (!N) break;
                                if ((c[(N + 8) >> 2] | 0) != (c[(K + 44) >> 2] | 0)) break;
                                M = c[T >> 2] | 0;
                                if ((M | 0) <= 0) break;
                                if ((M | 0) != (c[N >> 2] | 0)) break;
                                a[y >> 0] = 0;
                                Eg(k, K, N);
                                qh((K + 24) | 0, M, +(c[k >> 2] | 0), +(c[S >> 2] | 0));
                                Sg(c[h >> 2] | 0, N);
                                Tg(c[h >> 2] | 0, (A + (c[b >> 2] | 0)) | 0, 0);
                                Sg(b, T);
                                Eg(l, b, T);
                                N = l;
                                M = c[N >> 2] | 0;
                                K = c[(N + 4) >> 2] | 0;
                                N = C;
                                c[N >> 2] = M;
                                c[(N + 4) >> 2] = K;
                                qh(x, c[T >> 2] | 0, +(M | 0), +(K | 0));
                                K = ((c[T >> 2] | 0) + 1) | 0;
                                c[T >> 2] = K;
                                c[f >> 2] = K;
                                Ug(b, K);
                                if ((c[f >> 2] | 0) == (c[B >> 2] | 0)) {
                                    Tg(b, G, 0);
                                    break;
                                } else {
                                    Vg(b, T);
                                    Wg(b, T);
                                    break;
                                }
                            }
                        while (0);
                        K = (E + 1) | 0;
                        do
                            if (
                                (
                                    (
                                        (((E | 0) > -2 ? (c[b >> 2] | 0) > (G | 0) : 0) ? ((M = c[((c[R >> 2] | 0) + (G << 2)) >> 2] | 0), (c[(M + 4) >> 2] | 0) > (K | 0)) : 0)
                                            ? ((N = c[((c[M >> 2] | 0) + (K << 2)) >> 2] | 0), (N | 0) != 0)
                                            : 0
                                    )
                                        ? ((M = c[T >> 2] | 0), (M | 0) > 0)
                                        : 0
                                )
                                    ? (M | 0) == (c[N >> 2] | 0)
                                    : 0
                            ) {
                                if ((c[(N + 8) >> 2] | 0) != (c[(T + 8) >> 2] | 0)) {
                                    U = 82;
                                    break;
                                }
                                Eg(m, b, T);
                                a[y >> 0] = 0;
                                Sg(b, N);
                                Tg(b, G, K);
                                Sg(b, T);
                                N = m;
                                M = c[N >> 2] | 0;
                                O = c[(N + 4) >> 2] | 0;
                                qh(x, c[T >> 2] | 0, +(M | 0), +(O | 0));
                                N = ((c[T >> 2] | 0) + 1) | 0;
                                c[T >> 2] = N;
                                c[f >> 2] = N;
                                V = C;
                                c[V >> 2] = M;
                                c[(V + 4) >> 2] = O;
                                Ug(b, N);
                                if ((c[f >> 2] | 0) == (c[B >> 2] | 0)) Tg(b, G, E);
                                else {
                                    Vg(b, T);
                                    Wg(b, T);
                                }
                                W = (E + -1) | 0;
                            } else U = 82;
                        while (0);
                        do
                            if ((U | 0) == 82) {
                                U = 0;
                                K = c[(T + 44) >> 2] | 0;
                                N = c[(K + 4) >> 2] | 0;
                                if ((N | 0) > 0) {
                                    O = c[K >> 2] | 0;
                                    K = 0;
                                    V = 0;
                                    while (1) {
                                        M = ((((c[c[(O + (V << 2)) >> 2] >> 2] | 0) == -1) & 1) + K) | 0;
                                        V = (V + 1) | 0;
                                        if ((V | 0) == (N | 0)) {
                                            X = M;
                                            break;
                                        } else K = M;
                                    }
                                } else X = 0;
                                if ((X | 0) == (N | 0)) {
                                    a[y >> 0] = 0;
                                    K = (T + 24) | 0;
                                    V = c[K >> 2] | 0;
                                    if (!V) {
                                        c[K >> 2] = 30;
                                        W = E;
                                        break;
                                    }
                                    O = (V + -1) | 0;
                                    c[K >> 2] = O;
                                    if (!O) {
                                        a[r >> 0] = 1;
                                        Eg(n, b, T);
                                        qh(x, -1, +(c[n >> 2] | 0), +(c[Q >> 2] | 0));
                                        Sg(b, T);
                                        Tg(b, G, E);
                                        W = (E + -1) | 0;
                                    } else W = E;
                                } else W = E;
                            }
                        while (0);
                        E = (W + 1) | 0;
                        O = c[R >> 2] | 0;
                        J = c[(O + (G << 2)) >> 2] | 0;
                        K = c[b >> 2] | 0;
                        if ((E | 0) >= (c[(J + 4) >> 2] | 0)) {
                            Y = K;
                            Z = O;
                            break;
                        } else L = K;
                    }
                } else {
                    Y = F;
                    Z = D;
                }
                L = (G + 1) | 0;
                if ((L | 0) < (Y | 0)) {
                    D = Z;
                    F = Y;
                    j = ~G;
                    G = L;
                } else break;
            }
        }
        G = c[P >> 2] | 0;
        if ((G | 0) > 0) {
            P = c[I >> 2] | 0;
            I = (b + 56) | 0;
            j = 0;
            do {
                Y = c[(P + (j << 2)) >> 2] | 0;
                F = (Y + 12) | 0;
                Z = c[F >> 2] | 0;
                D = c[(Y + 20) >> 2] | 0;
                if ((((Z | 0) > -1 ? Z : (0 - Z) | 0) | 0) > 10)
                    if ((D | 0) == (Z | 0)) U = 96;
                    else {
                        a[v >> 0] = 1;
                        U = 95;
                    }
                else U = 95;
                if ((U | 0) == 95) {
                    U = 0;
                    if ((D | 0) == (Z | 0)) U = 96;
                    else _ = 0;
                }
                if ((U | 0) == 96) {
                    U = 0;
                    _ = (((a[I >> 0] | 0) != 0 ? 3 : -3) + Z) | 0;
                }
                c[F >> 2] = _;
                j = (j + 1) | 0;
            } while ((j | 0) < (G | 0));
            $ = 0;
            do {
                c[((c[(P + ($ << 2)) >> 2] | 0) + 16) >> 2] = 0;
                $ = ($ + 1) | 0;
            } while (($ | 0) != (G | 0));
        }
        c[o >> 2] = b;
        G = (o + 4) | 0;
        c[G >> 2] = 0;
        $ = (o + 8) | 0;
        c[$ >> 2] = -1;
        b: do
            if (kh(o) | 0) {
                P = (b + 56) | 0;
                while (1) {
                    j = c[((c[c[((c[((c[o >> 2] | 0) + 8) >> 2] | 0) + (c[G >> 2] << 2)) >> 2] >> 2] | 0) + (c[$ >> 2] << 2)) >> 2] | 0;
                    _ = c[(j + 8) >> 2] | 0;
                    if (!(a[P >> 0] | 0)) {
                        if ((_ | 0) >= (((c[u >> 2] | 0) * 200) | 0)) U = 104;
                    } else if ((_ | 0) < -199) U = 104;
                    if ((U | 0) == 104 ? ((U = 0), Lg(b, c[(j + 44) >> 2] | 0) | 0) : 0) break;
                    if (!(kh(o) | 0)) break b;
                }
                a[z >> 0] = 1;
                i = d;
                return;
            }
        while (0);
        o = (e + 0) | 0;
        $ = (o + 120) | 0;
        do {
            c[o >> 2] = 0;
            o = (o + 4) | 0;
        } while ((o | 0) < ($ | 0));
        c[p >> 2] = b;
        o = (p + 4) | 0;
        c[o >> 2] = 0;
        $ = (p + 8) | 0;
        c[$ >> 2] = -1;
        G = 0;
        c: while (1) {
            do {
                if (!(kh(p) | 0)) break c;
                aa = c[c[((c[c[((c[((c[p >> 2] | 0) + 8) >> 2] | 0) + (c[o >> 2] << 2)) >> 2] >> 2] | 0) + (c[$ >> 2] << 2)) >> 2] >> 2] | 0;
            } while ((aa | 0) <= 0);
            P = (e + (aa << 2)) | 0;
            j = c[P >> 2] | 0;
            c[P >> 2] = j + 1;
            G = ((j | 0) > 0) | G;
        }
        aa = (b + 58) | 0;
        if ((a[aa >> 0] | 0) != 0 ? ((c[q >> 2] = b), ($ = (q + 4) | 0), (c[$ >> 2] = 0), (o = (q + 8) | 0), (c[o >> 2] = -1), kh(q) | 0) : 0)
            do {
                p = c[((c[c[((c[((c[q >> 2] | 0) + 8) >> 2] | 0) + (c[$ >> 2] << 2)) >> 2] >> 2] | 0) + (c[o >> 2] << 2)) >> 2] | 0;
                j = c[p >> 2] | 0;
                if ((j | 0) > 0) ba = ((c[(e + (j << 2)) >> 2] | 0) > 1) & 1;
                else ba = 0;
                a[(p + 20) >> 0] = ba;
            } while (kh(q) | 0);
        q = (b + 68) | 0;
        ba = c[q >> 2] | 0;
        if (!ba) {
            if (G) {
                e = c[b >> 2] | 0;
                if ((e | 0) > 0) {
                    o = c[(b + 8) >> 2] | 0;
                    $ = 0;
                    p = 0;
                    while (1) {
                        j = ((c[((c[(o + ($ << 2)) >> 2] | 0) + 4) >> 2] | 0) + p) | 0;
                        $ = ($ + 1) | 0;
                        if (($ | 0) >= (e | 0)) {
                            ca = j;
                            break;
                        } else p = j;
                    }
                } else ca = 0;
                da = 1.0 / (+Xg(b, c[(b + 104) >> 2] | 0, ca, (a[(b + 59) >> 0] | 0) != 0) * 60.0);
                ca = (b + 52) | 0;
                ea = +g[ca >> 2] - da;
                g[ca >> 2] = ea;
                if (!(ea <= 0.0)) {
                    i = d;
                    return;
                }
                g[ca >> 2] = 0.0;
                if (a[aa >> 0] | 0) a[z >> 0] = 1;
            }
        } else if ((ba | 0) == 1) {
            if (!(a[y >> 0] | 0)) {
                i = d;
                return;
            }
            if (G ? !(+g[(b + 52) >> 2] <= 0.0001) : 0) {
                i = d;
                return;
            }
        } else if ((ba | 0) == 3) {
            aa = a[y >> 0] | 0;
            if (((aa << 24) >> 24 == 0) | G) {
                fa = aa;
                ga = 0;
                U = 140;
            } else {
                a[z >> 0] = 1;
                fa = aa;
                ga = 0;
                U = 140;
            }
        } else if ((ba | 0) == 2) {
            if (!(a[y >> 0] | 0)) {
                i = d;
                return;
            }
            aa = c[b >> 2] | 0;
            if ((aa | 0) > 0) {
                ca = (b + 8) | 0;
                p = aa;
                aa = 0;
                e = 0;
                $ = 0;
                while (1) {
                    o = c[((c[ca >> 2] | 0) + (aa << 2)) >> 2] | 0;
                    j = c[(o + 4) >> 2] | 0;
                    $ = (j + $) | 0;
                    if ((j | 0) > 0) {
                        j = c[((c[(ih(o) | 0) >> 2] | 0) + 8) >> 2] | 0;
                        ha = c[b >> 2] | 0;
                        ia = e | ((j | 0) >= (((((c[u >> 2] | 0) * 200) | 0) + -400) | 0));
                    } else {
                        ha = p;
                        ia = e;
                    }
                    aa = (aa + 1) | 0;
                    if ((aa | 0) >= (ha | 0)) break;
                    else {
                        p = ha;
                        e = ia;
                    }
                }
                ja = c[q >> 2] | 0;
                ka = ia;
                la = $;
            } else {
                ja = 2;
                ka = 0;
                la = 0;
            }
            $ = c[(b + 104) >> 2] | 0;
            ma = ja;
            na = (((la | 0) < ((($ | 0) < 20 ? ($ + 2) | 0 : 22) | 0)) | (G ^ 1)) & (ka ^ 1);
            U = 138;
        } else {
            ma = ba;
            na = 0;
            U = 138;
        }
        if ((U | 0) == 138)
            if ((ma | 0) == 3) {
                fa = a[y >> 0] | 0;
                ga = na;
                U = 140;
            } else {
                oa = na;
                U = 142;
            }
        if ((U | 0) == 140)
            if (!(((fa << 24) >> 24 == 0) | G)) {
                a[z >> 0] = 1;
                if (!ga) {
                    i = d;
                    return;
                }
            } else {
                oa = ga;
                U = 142;
            }
        if ((U | 0) == 142 ? !oa : 0) {
            i = d;
            return;
        }
        a[t >> 0] = 1;
        a[y >> 0] = 0;
        if (a[(b + 67) >> 0] | 0) {
            y = c[b >> 2] | 0;
            if ((y | 0) > 0) {
                t = y;
                y = 0;
                do {
                    y = ((Yg(b, 0, (t - y) | 0) | 0) + y) | 0;
                    t = c[b >> 2] | 0;
                } while ((t | 0) > (y | 0));
            }
        } else Cg(b);
        y = (b + 52) | 0;
        ea = +g[y >> 2] + 1.0;
        g[y >> 2] = ea > 1.0 ? 1.0 : ea;
        if (!(a[(b + 66) >> 0] | 0)) {
            i = d;
            return;
        }
        y = (b + 56) | 0;
        a[y >> 0] = a[y >> 0] ^ 1;
        i = d;
        return;
    }
    function Pg(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0;
        e = i;
        f = c[(b + 4) >> 2] | 0;
        if (!(((f | 0) > 0) & ((d | 0) != 0))) {
            g = d;
            i = e;
            return g | 0;
        }
        h = c[b >> 2] | 0;
        b = c[(a + 8) >> 2] | 0;
        j = (a + 4) | 0;
        a = d;
        d = 0;
        while (1) {
            k = c[(h + (d << 2)) >> 2] | 0;
            if ((a | 0) >= 0)
                if ((a | 0) > 0) {
                    l = ((((c[j >> 2] | 0) * 200) | 0) + -200 - (c[(k + 8) >> 2] | 0)) | 0;
                    m = (a | 0) < (l | 0) ? a : l;
                } else m = 0;
            else {
                l = (0 - (c[(k + 8) >> 2] | 0)) | 0;
                m = (a | 0) > (l | 0) ? a : l;
            }
            l = c[(b + ((((c[(k + 4) >> 2] | 0) / 200) | 0) << 2)) >> 2] | 0;
            n = c[(l + 4) >> 2] | 0;
            if ((n | 0) > 0) {
                o = c[(k + 44) >> 2] | 0;
                p = (k + 8) | 0;
                q = c[l >> 2] | 0;
                l = m;
                r = 0;
                s = 0;
                while (1) {
                    t = c[(q + (s << 2)) >> 2] | 0;
                    r = ((t | 0) == (k | 0)) | r;
                    do
                        if ((c[(t + 44) >> 2] | 0) != (o | 0)) {
                            u = c[t >> 2] | 0;
                            if ((u | 0) > 0) v = (u | 0) == (c[k >> 2] | 0);
                            else v = 0;
                            if (!(((l | 0) < 1) | (r ^ 1))) {
                                u = c[(t + 8) >> 2] | 0;
                                w = ((v ? u : (u + -200) | 0) - (c[p >> 2] | 0)) | 0;
                                x = (l | 0) < (w | 0) ? l : w;
                                break;
                            }
                            if (!(((l | 0) > -1) | r)) {
                                w = c[(t + 8) >> 2] | 0;
                                u = ((v ? w : (w + 200) | 0) - (c[p >> 2] | 0)) | 0;
                                x = (l | 0) > (u | 0) ? l : u;
                            } else x = l;
                        } else x = l;
                    while (0);
                    s = (s + 1) | 0;
                    if ((s | 0) >= (n | 0)) {
                        y = x;
                        break;
                    } else l = x;
                }
            } else y = m;
            d = (d + 1) | 0;
            if (!(((d | 0) < (f | 0)) & ((y | 0) != 0))) {
                g = y;
                break;
            } else a = y;
        }
        i = e;
        return g | 0;
    }
    function Qg(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0;
        e = i;
        if (!d) {
            i = e;
            return;
        }
        f = (d | 0) < 0;
        g = c[a >> 2] | 0;
        h = f ? 0 : (g + -1) | 0;
        j = f ? g : -1;
        g = (((d >> 31) & 2) + -1) | 0;
        if ((h | 0) == (j | 0)) {
            i = e;
            return;
        }
        f = (a + 8) | 0;
        k = c[f >> 2] | 0;
        l = h;
        while (1) {
            h = c[(k + (l << 2)) >> 2] | 0;
            m = (h + 4) | 0;
            n = c[m >> 2] | 0;
            if ((n | 0) > 0) {
                o = (((l + d) | 0) * 200) | 0;
                p = h;
                h = n;
                n = m;
                m = k;
                q = 0;
                while (1) {
                    r = c[p >> 2] | 0;
                    s = (r + (q << 2)) | 0;
                    t = c[s >> 2] | 0;
                    if ((c[(t + 44) >> 2] | 0) == (b | 0)) {
                        u = (q + 1) | 0;
                        yk(s | 0, (r + (u << 2)) | 0, ((h - u) << 2) | 0) | 0;
                        c[n >> 2] = (c[n >> 2] | 0) + -1;
                        c[(t + 4) >> 2] = o;
                        dh(a, t);
                        v = c[f >> 2] | 0;
                        w = (q + -1) | 0;
                    } else {
                        v = m;
                        w = q;
                    }
                    q = (w + 1) | 0;
                    p = c[(v + (l << 2)) >> 2] | 0;
                    n = (p + 4) | 0;
                    h = c[n >> 2] | 0;
                    if ((q | 0) >= (h | 0)) {
                        x = v;
                        break;
                    } else m = v;
                }
            } else x = k;
            l = (g + l) | 0;
            if ((l | 0) == (j | 0)) break;
            else k = x;
        }
        i = e;
        return;
    }
    function Rg(b, d) {
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0,
            C = 0,
            D = 0,
            E = 0,
            F = 0,
            G = 0,
            H = 0,
            I = 0,
            J = 0,
            K = 0,
            L = 0,
            M = 0,
            N = 0,
            O = 0,
            P = 0,
            Q = 0,
            R = 0,
            S = 0,
            T = 0,
            U = 0,
            V = 0,
            W = 0,
            X = 0,
            Y = 0,
            Z = 0,
            _ = 0;
        e = i;
        f = c[(b + 132) >> 2] | 0;
        if ((f | 0) != 0 ? (c[(f + 44) >> 2] | 0) == (d | 0) : 0) g = 0;
        else g = c[(d + 12) >> 2] | 0;
        f = ((((c[(b + 4) >> 2] | 0) * 200) | 0) + -200) | 0;
        h = c[(d + 4) >> 2] | 0;
        if ((h | 0) > 0) {
            j = c[d >> 2] | 0;
            k = a[(b + 56) >> 0] | 0;
            l = (k << 24) >> 24 == 0;
            m = (b + 44) | 0;
            n = (b + 8) | 0;
            b = (k << 24) >> 24 != 0 ? -1 : 1;
            o = k;
            p = k;
            q = k;
            k = 0;
            r = g;
            while (1) {
                s = c[(j + (k << 2)) >> 2] | 0;
                if (!l) {
                    t = c[(s + 8) >> 2] | 0;
                    u = (f - t) | 0;
                    v = (r | 0) < (u | 0) ? r : u;
                    u = c[((c[n >> 2] | 0) + ((((c[(s + 4) >> 2] | 0) / 200) | 0) << 2)) >> 2] | 0;
                    w = c[(u + 4) >> 2] | 0;
                    x = (w + -1) | 0;
                    if (!((o << 24) >> 24)) {
                        y = 0;
                        z = 0;
                        A = t;
                        B = 0;
                        C = w;
                        D = u;
                        E = x;
                        F = v;
                        G = 9;
                    } else {
                        H = o;
                        I = o;
                        J = x;
                        K = -1;
                        L = u;
                        M = o;
                        N = t;
                        O = v;
                    }
                } else {
                    v = c[(s + 8) >> 2] | 0;
                    t = ((c[m >> 2] | 0) - v) | 0;
                    u = c[((c[n >> 2] | 0) + ((((c[(s + 4) >> 2] | 0) / 200) | 0) << 2)) >> 2] | 0;
                    y = p;
                    z = o;
                    A = v;
                    B = q;
                    C = c[(u + 4) >> 2] | 0;
                    D = u;
                    E = 0;
                    F = (r | 0) > (t | 0) ? r : t;
                    G = 9;
                }
                if ((G | 0) == 9) {
                    G = 0;
                    H = y;
                    I = z;
                    J = E;
                    K = C;
                    L = D;
                    M = B;
                    N = A;
                    O = F;
                }
                a: do
                    if ((J | 0) == (K | 0)) {
                        P = H;
                        Q = O;
                    } else {
                        t = c[L >> 2] | 0;
                        u = (M << 24) >> 24 != 0 ? -200 : 200;
                        v = H;
                        x = O;
                        w = J;
                        while (1) {
                            R = c[(t + (w << 2)) >> 2] | 0;
                            if ((R | 0) == (s | 0)) {
                                P = v;
                                Q = x;
                                break a;
                            }
                            S = c[(R + 44) >> 2] | 0;
                            do
                                if ((S | 0) != (d | 0)) {
                                    T = ((c[(S + 20) >> 2] | 0) + (c[(R + 8) >> 2] | 0)) | 0;
                                    U = c[s >> 2] | 0;
                                    if ((U | 0) > 0 ? (U | 0) == (c[R >> 2] | 0) : 0) {
                                        V = v;
                                        W = T;
                                    } else {
                                        V = M;
                                        W = (u + T) | 0;
                                    }
                                    T = (W - N) | 0;
                                    if (!((V << 24) >> 24)) {
                                        X = 0;
                                        Y = (x | 0) > (T | 0) ? x : T;
                                        break;
                                    } else {
                                        X = V;
                                        Y = (x | 0) < (T | 0) ? x : T;
                                        break;
                                    }
                                } else {
                                    X = v;
                                    Y = x;
                                }
                            while (0);
                            w = (w + b) | 0;
                            if ((w | 0) == (K | 0)) {
                                P = X;
                                Q = Y;
                                break;
                            } else {
                                v = X;
                                x = Y;
                            }
                        }
                    }
                while (0);
                k = (k + 1) | 0;
                if ((k | 0) >= (h | 0)) {
                    Z = Q;
                    break;
                } else {
                    o = I;
                    p = P;
                    q = M;
                    r = Q;
                }
            }
        } else Z = g;
        g = (d + 20) | 0;
        if ((c[g >> 2] | 0) == (Z | 0)) {
            _ = 0;
            i = e;
            return _ | 0;
        }
        c[g >> 2] = Z;
        _ = 1;
        i = e;
        return _ | 0;
    }
    function Sg(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0;
        d = i;
        e = c[(b + 44) >> 2] | 0;
        f = (a + 16) | 0;
        g = c[f >> 2] | 0;
        h = c[(a + 12) >> 2] | 0;
        a: do
            if ((g | 0) > 0) {
                j = 0;
                while (1) {
                    if ((c[(h + (j << 2)) >> 2] | 0) == (e | 0)) {
                        k = j;
                        break a;
                    }
                    j = (j + 1) | 0;
                    if ((j | 0) >= (g | 0)) {
                        k = -1;
                        break;
                    }
                }
            } else k = -1;
        while (0);
        j = (k + 1) | 0;
        yk((h + (k << 2)) | 0, (h + (j << 2)) | 0, ((g - j) << 2) | 0) | 0;
        c[f >> 2] = (c[f >> 2] | 0) + -1;
        f = 0;
        do {
            j = (b + (f << 2) + 28) | 0;
            g = c[j >> 2] | 0;
            if (g) {
                c[(g + ((((f + 2) | 0) % 4 | 0) << 2) + 28) >> 2] = 0;
                c[j >> 2] = 0;
            }
            f = (f + 1) | 0;
        } while ((f | 0) != 4);
        f = (e + 4) | 0;
        j = c[f >> 2] | 0;
        b: do
            if ((j | 0) > 0) {
                g = c[e >> 2] | 0;
                h = 0;
                do {
                    c[((c[(g + (h << 2)) >> 2] | 0) + 44) >> 2] = 0;
                    h = (h + 1) | 0;
                } while ((h | 0) < (j | 0));
                l = g;
                m = j;
                n = 0;
                while (1) {
                    g = c[(l + (n << 2)) >> 2] | 0;
                    if (((c[(g + 44) >> 2] | 0) != 0) | ((g | 0) == (b | 0))) o = m;
                    else {
                        Wg(a, g);
                        o = c[f >> 2] | 0;
                    }
                    g = (n + 1) | 0;
                    if ((g | 0) >= (o | 0)) break b;
                    l = c[e >> 2] | 0;
                    m = o;
                    n = g;
                }
            }
        while (0);
        if (!e) {
            i = d;
            return;
        }
        ik(c[e >> 2] | 0);
        vj(e);
        i = d;
        return;
    }
    function Tg(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0;
        e = i;
        f = (a + 8) | 0;
        g = c[((c[c[((c[f >> 2] | 0) + (b << 2)) >> 2] >> 2] | 0) + (d << 2)) >> 2] | 0;
        if (c[(g + 44) >> 2] | 0) {
            h = qd(4) | 0;
            c[h >> 2] = 96;
            Bf(h | 0, 4840, 0);
        }
        Vg(a, g);
        if (g) vj(g);
        g = c[((c[f >> 2] | 0) + (b << 2)) >> 2] | 0;
        b = c[g >> 2] | 0;
        f = (d + 1) | 0;
        a = (g + 4) | 0;
        yk((b + (d << 2)) | 0, (b + (f << 2)) | 0, (((c[a >> 2] | 0) - f) << 2) | 0) | 0;
        c[a >> 2] = (c[a >> 2] | 0) + -1;
        i = e;
        return;
    }
    function Ug(b, d) {
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            h = 0,
            j = 0.0;
        e = i;
        f = (b + 100) | 0;
        h = c[f >> 2] | 0;
        if ((h | 0) >= (d | 0)) {
            if ((c[(b + 60) >> 2] | 0) == (d | 0)) c[f >> 2] = h + 1;
        } else c[f >> 2] = d;
        f = (b + 104) | 0;
        h = c[f >> 2] | 0;
        if ((h | 0) >= (d | 0)) {
            if ((c[(b + 60) >> 2] | 0) == (d | 0)) c[f >> 2] = h + 1;
        } else c[f >> 2] = d;
        if (!(a[(b + 58) >> 0] | 0)) {
            i = e;
            return;
        }
        d = (b + 52) | 0;
        j = +g[d >> 2] + 0.1;
        g[d >> 2] = j > 1.0 ? 1.0 : j;
        i = e;
        return;
    }
    function Vg(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0;
        d = i;
        e = (a + 132) | 0;
        if ((c[e >> 2] | 0) != (b | 0)) {
            i = d;
            return;
        }
        f = c[(b + 44) >> 2] | 0;
        if (f) c[(f + 12) >> 2] = 0;
        c[e >> 2] = 0;
        Mg(a);
        i = d;
        return;
    }
    function Wg(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0;
        d = i;
        e = (b + 44) | 0;
        if (c[e >> 2] | 0) {
            f = qd(4) | 0;
            c[f >> 2] = 56;
            Bf(f | 0, 4840, 0);
        }
        f = tj(24) | 0;
        c[(f + 0) >> 2] = 0;
        c[(f + 4) >> 2] = 0;
        c[(f + 8) >> 2] = 0;
        c[(f + 12) >> 2] = 0;
        c[(f + 16) >> 2] = 0;
        c[(f + 20) >> 2] = 0;
        g = (f + 4) | 0;
        c[(f + 0) >> 2] = 0;
        c[(f + 4) >> 2] = 0;
        c[(f + 8) >> 2] = 0;
        c[(f + 12) >> 2] = 0;
        c[e >> 2] = f;
        lh(f, 1);
        e = c[g >> 2] | 0;
        h = (e + 1) | 0;
        c[g >> 2] = h;
        c[((c[f >> 2] | 0) + (e << 2)) >> 2] = b;
        if ((e | 0) > -1) {
            j = h;
            k = 0;
        } else {
            l = (a + 12) | 0;
            m = (a + 16) | 0;
            n = c[m >> 2] | 0;
            o = (n + 1) | 0;
            mh(l, o);
            p = c[m >> 2] | 0;
            q = (p + 1) | 0;
            c[m >> 2] = q;
            r = c[l >> 2] | 0;
            s = (r + (p << 2)) | 0;
            c[s >> 2] = f;
            i = d;
            return;
        }
        while (1) {
            h = c[((c[f >> 2] | 0) + (k << 2)) >> 2] | 0;
            e = j;
            b = 0;
            while (1) {
                t = c[(h + (b << 2) + 28) >> 2] | 0;
                a: do
                    if (!t) u = e;
                    else {
                        b: do
                            if ((e | 0) > 0) {
                                v = c[f >> 2] | 0;
                                w = 0;
                                while (1) {
                                    x = (w + 1) | 0;
                                    if ((c[(v + (w << 2)) >> 2] | 0) == (t | 0)) break;
                                    if ((x | 0) < (e | 0)) w = x;
                                    else break b;
                                }
                                if ((w | 0) != -1) {
                                    u = e;
                                    break a;
                                }
                            }
                        while (0);
                        c[(t + 44) >> 2] = f;
                        lh(f, (e + 1) | 0);
                        v = c[g >> 2] | 0;
                        x = (v + 1) | 0;
                        c[g >> 2] = x;
                        c[((c[f >> 2] | 0) + (v << 2)) >> 2] = t;
                        u = x;
                    }
                while (0);
                b = (b + 1) | 0;
                if ((b | 0) == 4) break;
                else e = u;
            }
            k = (k + 1) | 0;
            if ((k | 0) >= (u | 0)) break;
            else j = u;
        }
        l = (a + 12) | 0;
        m = (a + 16) | 0;
        n = c[m >> 2] | 0;
        o = (n + 1) | 0;
        mh(l, o);
        p = c[m >> 2] | 0;
        q = (p + 1) | 0;
        c[m >> 2] = q;
        r = c[l >> 2] | 0;
        s = (r + (p << 2)) | 0;
        c[s >> 2] = f;
        i = d;
        return;
    }
    function Xg(b, d, e, f) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        var g = 0,
            h = 0.0,
            j = 0.0,
            k = 0.0,
            l = 0.0,
            m = 0.0,
            n = 0.0;
        g = i;
        if (f) {
            h = 60.0;
            i = g;
            return +h;
        }
        do
            if ((d | 0) >= 10) {
                f = c[(b + 60) >> 2] | 0;
                if ((f | 0) > (d | 0)) {
                    j = (+((d + -10) | 0) / (+(f | 0) + -10.0)) * -2.0 + 12.0;
                    break;
                } else {
                    j = (+((d - f) | 0) / 20.0) * -4.0 + 10.0;
                    break;
                }
            } else {
                k = +(d | 0);
                l = +(e | 0) / ((d | 0) > 5 ? k : 5.0) + -1.0;
                m = l < 0.0 ? 0.0 : l;
                j = (+(d | 0) / 10.0) * 0.0 + 12.0 + (m + (k / 10.0) * (0.0 - m));
            }
        while (0);
        if (!(c[(b + 112) >> 2] | 0)) n = j;
        else n = j + 3.0;
        if (!(a[(b + 58) >> 0] | 0)) {
            h = n;
            i = g;
            return +h;
        }
        h = n * 0.6;
        i = g;
        return +h;
    }
    function Yg(b, d, e) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0,
            C = 0,
            D = 0,
            E = 0,
            F = 0,
            G = 0,
            H = 0,
            I = 0;
        f = i;
        i = (i + 16) | 0;
        g = (f + 4) | 0;
        h = f;
        j = (b + 4) | 0;
        k = ch(b, 0, ((((c[j >> 2] | 0) * 200) | 0) + 8e3) | 0, -1) | 0;
        l = $g(b) | 0;
        m = (b + 40) | 0;
        n = Ch(m) | 0;
        switch ((n >>> 0) % ((c[(80 + ((((l | 0) > (e | 0) ? e : l) + -1) << 2)) >> 2] | 0) >>> 0) | 0 | 0) {
            case 4: {
                eh(b, eh(b, k, 1) | 0, 1) | 0;
                o = 3;
                break;
            }
            case 5: {
                eh(b, k, 1) | 0;
                eh(b, k, 2) | 0;
                o = 2;
                break;
            }
            case 6: {
                eh(b, eh(b, k, 1) | 0, 2) | 0;
                o = 2;
                break;
            }
            case 7: {
                eh(b, eh(b, k, 1) | 0, 0) | 0;
                o = 2;
                break;
            }
            case 8: {
                eh(b, eh(b, k, 2) | 0, 1) | 0;
                o = 2;
                break;
            }
            case 1: {
                eh(b, k, 1) | 0;
                o = 2;
                break;
            }
            case 2: {
                eh(b, k, 0) | 0;
                o = 1;
                break;
            }
            case 3: {
                eh(b, eh(b, k, 0) | 0, 0) | 0;
                o = 1;
                break;
            }
            default:
                o = 1;
        }
        l = c[b >> 2] | 0;
        e = (k + 44) | 0;
        if ((o | 0) <= (l | 0)) {
            n = l;
            l = 0;
            p = 0;
            q = -1;
            r = 999999;
            while (1) {
                if ((l | 0) == (p | 0)) {
                    s = n;
                    t = p;
                } else {
                    Qg(b, c[e >> 2] | 0, (l - p) | 0);
                    s = c[b >> 2] | 0;
                    t = l;
                }
                u = c[e >> 2] | 0;
                v = Pg(b, u, -999999) | 0;
                w = ((q | 0) == -1) | ((v | 0) < (r | 0));
                r = w ? v : r;
                q = w ? l : q;
                l = (l + 1) | 0;
                if (((l + o) | 0) > (s | 0)) break;
                else {
                    n = s;
                    p = t;
                }
            }
            if ((q | 0) == (t | 0)) {
                x = e;
                y = u;
                z = r;
            } else {
                A = u;
                B = t;
                C = q;
                D = r;
                E = 16;
            }
        } else {
            A = c[e >> 2] | 0;
            B = 0;
            C = -1;
            D = 999999;
            E = 16;
        }
        if ((E | 0) == 16) {
            e = (k + 44) | 0;
            Qg(b, A, (C - B) | 0);
            x = e;
            y = c[e >> 2] | 0;
            z = D;
        }
        D = (y + 4) | 0;
        e = c[D >> 2] | 0;
        if ((e | 0) > 0) {
            B = (b + 65) | 0;
            C = (k + 36) | 0;
            A = (b + 8) | 0;
            r = e;
            e = 0;
            while (1) {
                q = c[((c[y >> 2] | 0) + (e << 2)) >> 2] | 0;
                if ((a[B >> 0] | 0) != 0 ? ((t = (r + -1) | 0), (u = (t | 0) < 2 ? t : 2), (((Ch(m) | 0) >>> 0) % 3 | 0 | 0) == 0) : 0) {
                    t = c[D >> 2] | 0;
                    if ((t | 0) > 0) {
                        p = c[y >> 2] | 0;
                        s = 0;
                        n = 0;
                        while (1) {
                            o = ((((c[c[(p + (n << 2)) >> 2] >> 2] | 0) == -1) & 1) + s) | 0;
                            n = (n + 1) | 0;
                            if ((n | 0) == (t | 0)) {
                                F = o;
                                break;
                            } else s = o;
                        }
                    } else F = 0;
                    if ((F | 0) < (u | 0)) {
                        c[q >> 2] = -1;
                        G = t;
                    } else E = 25;
                } else E = 25;
                if ((E | 0) == 25) {
                    E = 0;
                    s = (e | 0) > 0;
                    a: while (1) {
                        H = _g(b) | 0;
                        if (s) {
                            n = c[c[x >> 2] >> 2] | 0;
                            p = 0;
                            while (1) {
                                if ((c[c[(n + (p << 2)) >> 2] >> 2] | 0) == (H | 0)) continue a;
                                p = (p + 1) | 0;
                                if ((p | 0) >= (e | 0)) break;
                            }
                        }
                        if (c[C >> 2] | 0) break;
                        fh(b, k, g, h) | 0;
                        p = c[h >> 2] | 0;
                        if ((p | 0) <= 0) break;
                        if ((c[c[((c[c[((c[A >> 2] | 0) + (c[g >> 2] << 2)) >> 2] >> 2] | 0) + ((p + -1) << 2)) >> 2] >> 2] | 0) != (H | 0)) break;
                    }
                    c[q >> 2] = H;
                    G = c[D >> 2] | 0;
                }
                e = (e + 1) | 0;
                if ((e | 0) >= (G | 0)) break;
                else r = G;
            }
        }
        if (d) {
            d = c[x >> 2] | 0;
            G = c[(d + 4) >> 2] | 0;
            if ((G | 0) <= 0) {
                I = G;
                i = f;
                return I | 0;
            }
            r = c[d >> 2] | 0;
            d = 0;
            do {
                e = ((c[(r + (d << 2)) >> 2] | 0) + 8) | 0;
                c[e >> 2] = (c[e >> 2] | 0) + z;
                d = (d + 1) | 0;
            } while ((d | 0) != (G | 0));
            I = G;
            i = f;
            return I | 0;
        } else {
            G = ((((c[j >> 2] | 0) * 200) | 0) + 600 - (c[(k + 8) >> 2] | 0)) | 0;
            k = c[x >> 2] | 0;
            x = (z | 0) > (G | 0) ? z : G;
            G = c[(k + 4) >> 2] | 0;
            if ((G | 0) <= 0) {
                I = G;
                i = f;
                return I | 0;
            }
            z = c[k >> 2] | 0;
            k = 0;
            do {
                j = ((c[(z + (k << 2)) >> 2] | 0) + 8) | 0;
                c[j >> 2] = (c[j >> 2] | 0) + x;
                k = (k + 1) | 0;
            } while ((k | 0) != (G | 0));
            I = G;
            i = f;
            return I | 0;
        }
        return 0;
    }
    function Zg(b, d) {
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0;
        e = i;
        f = (b + 8) | 0;
        g = c[((c[f >> 2] | 0) + (d << 2)) >> 2] | 0;
        h = (b + 56) | 0;
        if ((c[(g + 4) >> 2] | 0) > 0) {
            if (!(a[h >> 0] | 0)) j = c[g >> 2] | 0;
            else j = ih(g) | 0;
            k = c[j >> 2] | 0;
        } else k = 0;
        j = tj(48) | 0;
        c[(j + 16) >> 2] = 0;
        c[j >> 2] = 0;
        c[(j + 12) >> 2] = -2;
        g = (j + 24) | 0;
        a[(j + 20) >> 0] = 0;
        c[(g + 0) >> 2] = 0;
        c[(g + 4) >> 2] = 0;
        c[(g + 8) >> 2] = 0;
        c[(g + 12) >> 2] = 0;
        c[(g + 16) >> 2] = 0;
        c[(g + 20) >> 2] = 0;
        g = c[((a[h >> 0] | 0) == 0 ? (b + 44) | 0 : (b + 48) | 0) >> 2] | 0;
        l = (j + 4) | 0;
        c[l >> 2] = d * 200;
        c[(l + 4) >> 2] = g;
        g = (k | 0) == 0;
        do {
            l = _g(b) | 0;
            c[j >> 2] = l;
            if (g) break;
            m = c[k >> 2] | 0;
        } while (((m | 0) > 0) & ((m | 0) == (l | 0)));
        k = c[((c[f >> 2] | 0) + (d << 2)) >> 2] | 0;
        d = (k + 4) | 0;
        f = c[d >> 2] | 0;
        g = (a[h >> 0] | 0) == 0 ? 0 : f;
        lh(k, (f + 1) | 0);
        f = c[k >> 2] | 0;
        yk((f + ((g + 1) << 2)) | 0, (f + (g << 2)) | 0, (((c[d >> 2] | 0) - g) << 2) | 0) | 0;
        c[((c[k >> 2] | 0) + (g << 2)) >> 2] = j;
        c[d >> 2] = (c[d >> 2] | 0) + 1;
        Wg(b, j);
        i = e;
        return;
    }
    function _g(a) {
        a = a | 0;
        var b = 0,
            d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0;
        b = i;
        i = (i + 16) | 0;
        d = b;
        e = c[(a + 60) >> 2] | 0;
        f = c[(a + 104) >> 2] | 0;
        if ((f | 0) < 5) {
            g = 3;
            h = -14;
        } else {
            j = (e + -1) | 0;
            g = (((f | 0) > (j | 0) ? j : f) + -2) | 0;
            h = (((f | 0) > (e | 0) ? e : f) + -19) | 0;
        }
        f = (a + 40) | 0;
        e = ((((Ch(f) | 0) >>> 0) % (g >>> 0) | 0) + 1) | 0;
        if ((e | 0) >= (h | 0)) {
            k = e;
            i = b;
            return k | 0;
        }
        j = (d + 4) | 0;
        l = (d + 8) | 0;
        m = e;
        a: while (1) {
            c[d >> 2] = a;
            c[j >> 2] = 0;
            c[l >> 2] = -1;
            while (1) {
                if (!(kh(d) | 0)) break;
                if ((c[c[((c[c[((c[((c[d >> 2] | 0) + 8) >> 2] | 0) + (c[j >> 2] << 2)) >> 2] >> 2] | 0) + (c[l >> 2] << 2)) >> 2] >> 2] | 0) == (m | 0)) {
                    k = m;
                    n = 9;
                    break a;
                }
            }
            e = ((((Ch(f) | 0) >>> 0) % (g >>> 0) | 0) + 1) | 0;
            if ((e | 0) < (h | 0)) m = e;
            else {
                k = e;
                n = 9;
                break;
            }
        }
        if ((n | 0) == 9) {
            i = b;
            return k | 0;
        }
        return 0;
    }
    function $g(b) {
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        if (!(a[(b + 64) >> 0] | 0)) {
            f = 1;
            i = e;
            return f | 0;
        }
        g = c[(b + 104) >> 2] | 0;
        if ((g | 0) >= (c[(b + 60) >> 2] | 0)) {
            f = 4;
            i = e;
            return f | 0;
        }
        h = ((g | 0) / 5) | 0;
        if ((g | 0) < 5) j = 1;
        else j = (h | 0) > 3 ? 3 : h;
        f = ((d[(b + 65) >> 0] | 0) + j) | 0;
        i = e;
        return f | 0;
    }
    function ah(b, d) {
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0;
        e = i;
        i = (i + 32) | 0;
        f = e;
        g = (f + 0) | 0;
        h = (g + 30) | 0;
        do {
            a[g >> 0] = 0;
            g = (g + 1) | 0;
        } while ((g | 0) < (h | 0));
        g = c[(b + 4) >> 2] | 0;
        if ((g | 0) > 0) {
            h = c[b >> 2] | 0;
            b = 0;
            do {
                j = c[c[(h + (b << 2)) >> 2] >> 2] | 0;
                if ((j | 0) > 0) a[(f + j) >> 0] = 1;
                b = (b + 1) | 0;
            } while ((b | 0) < (g | 0));
        }
        g = c[(d + 4) >> 2] | 0;
        if ((g | 0) <= 0) {
            k = 0;
            i = e;
            return k | 0;
        }
        b = c[d >> 2] | 0;
        d = 0;
        while (1) {
            h = c[c[(b + (d << 2)) >> 2] >> 2] | 0;
            if ((h | 0) > 0 ? (a[(f + h) >> 0] | 0) != 0 : 0) {
                k = 1;
                l = 11;
                break;
            }
            d = (d + 1) | 0;
            if ((d | 0) >= (g | 0)) {
                k = 0;
                l = 11;
                break;
            }
        }
        if ((l | 0) == 11) {
            i = e;
            return k | 0;
        }
        return 0;
    }
    function bh(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0;
        e = i;
        yg(b, d);
        f = (b + 44) | 0;
        b = c[f >> 2] | 0;
        g = c[(d + 44) >> 2] | 0;
        if ((b | 0) == (g | 0)) {
            i = e;
            return;
        }
        d = (g + 4) | 0;
        a: do
            if ((c[d >> 2] | 0) > 0) {
                h = b;
                j = 0;
                while (1) {
                    k = c[((c[g >> 2] | 0) + (j << 2)) >> 2] | 0;
                    l = (h + 4) | 0;
                    lh(h, ((c[l >> 2] | 0) + 1) | 0);
                    m = c[l >> 2] | 0;
                    c[l >> 2] = m + 1;
                    c[((c[h >> 2] | 0) + (m << 2)) >> 2] = k;
                    c[(k + 44) >> 2] = c[f >> 2];
                    k = (j + 1) | 0;
                    if ((k | 0) >= (c[d >> 2] | 0)) break a;
                    h = c[f >> 2] | 0;
                    j = k;
                }
            }
        while (0);
        f = (a + 16) | 0;
        d = c[f >> 2] | 0;
        b = c[(a + 12) >> 2] | 0;
        b: do
            if ((d | 0) > 0) {
                a = 0;
                while (1) {
                    if ((c[(b + (a << 2)) >> 2] | 0) == (g | 0)) {
                        n = a;
                        break b;
                    }
                    a = (a + 1) | 0;
                    if ((a | 0) >= (d | 0)) {
                        n = -1;
                        break;
                    }
                }
            } else n = -1;
        while (0);
        a = (n + 1) | 0;
        yk((b + (n << 2)) | 0, (b + (a << 2)) | 0, ((d - a) << 2) | 0) | 0;
        c[f >> 2] = (c[f >> 2] | 0) + -1;
        if (!g) {
            i = e;
            return;
        }
        ik(c[g >> 2] | 0);
        vj(g);
        i = e;
        return;
    }
    function ch(b, d, e, f) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        var g = 0,
            h = 0,
            j = 0;
        g = i;
        h = tj(48) | 0;
        c[(h + 16) >> 2] = 0;
        c[(h + 12) >> 2] = -2;
        j = (h + 24) | 0;
        a[(h + 20) >> 0] = 0;
        c[(j + 0) >> 2] = 0;
        c[(j + 4) >> 2] = 0;
        c[(j + 8) >> 2] = 0;
        c[(j + 12) >> 2] = 0;
        c[(j + 16) >> 2] = 0;
        c[(j + 20) >> 2] = 0;
        c[h >> 2] = f;
        f = (h + 4) | 0;
        c[f >> 2] = d;
        c[(f + 4) >> 2] = e;
        dh(b, h);
        Wg(b, h);
        i = g;
        return h | 0;
    }
    function dh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0;
        d = i;
        e = c[(b + 4) >> 2] | 0;
        if ((e | 0) < 0) {
            f = qd(4) | 0;
            c[f >> 2] = 128;
            Bf(f | 0, 4840, 0);
        }
        if ((e | 0) > (((((c[a >> 2] | 0) * 200) | 0) + -200) | 0)) {
            f = qd(4) | 0;
            c[f >> 2] = 128;
            Bf(f | 0, 4840, 0);
        }
        f = c[((c[(a + 8) >> 2] | 0) + ((((e | 0) / 200) | 0) << 2)) >> 2] | 0;
        e = (f + 4) | 0;
        a = c[e >> 2] | 0;
        a: do
            if ((a | 0) > 0) {
                g = c[(b + 8) >> 2] | 0;
                h = c[f >> 2] | 0;
                j = 0;
                while (1) {
                    k = (j + 1) | 0;
                    if ((c[((c[(h + (j << 2)) >> 2] | 0) + 8) >> 2] | 0) >= (g | 0)) {
                        l = f;
                        m = j;
                        break a;
                    }
                    if ((k | 0) < (a | 0)) j = k;
                    else {
                        l = f;
                        m = k;
                        break;
                    }
                }
            } else {
                l = f;
                m = 0;
            }
        while (0);
        lh(f, (a + 1) | 0);
        a = c[l >> 2] | 0;
        yk((a + ((m + 1) << 2)) | 0, (a + (m << 2)) | 0, (((c[e >> 2] | 0) - m) << 2) | 0) | 0;
        c[((c[l >> 2] | 0) + (m << 2)) >> 2] = b;
        c[e >> 2] = (c[e >> 2] | 0) + 1;
        i = d;
        return;
    }
    function eh(b, d, e) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0;
        f = i;
        g = tj(48) | 0;
        h = (g + 4) | 0;
        c[h >> 2] = 0;
        c[(g + 8) >> 2] = 0;
        c[(g + 16) >> 2] = 0;
        c[g >> 2] = 0;
        c[(g + 12) >> 2] = -2;
        j = (g + 24) | 0;
        a[(g + 20) >> 0] = 0;
        c[(j + 0) >> 2] = 0;
        c[(j + 4) >> 2] = 0;
        c[(j + 8) >> 2] = 0;
        c[(j + 12) >> 2] = 0;
        c[(j + 16) >> 2] = 0;
        c[(j + 20) >> 2] = 0;
        if (!e) {
            k = 0;
            l = 200;
        } else if ((e | 0) == 2) {
            k = 0;
            l = -200;
        } else if ((e | 0) == 3) {
            k = -200;
            l = 0;
        } else if ((e | 0) == 1) {
            k = 200;
            l = 0;
        } else {
            k = 0;
            l = 0;
        }
        e = ((c[(d + 8) >> 2] | 0) + l) | 0;
        l = h;
        c[l >> 2] = (c[(d + 4) >> 2] | 0) + k;
        c[(l + 4) >> 2] = e;
        c[g >> 2] = -1;
        yg(d, g);
        dh(b, g);
        b = (d + 44) | 0;
        d = c[b >> 2] | 0;
        e = (d + 4) | 0;
        lh(d, ((c[e >> 2] | 0) + 1) | 0);
        l = c[e >> 2] | 0;
        c[e >> 2] = l + 1;
        c[((c[d >> 2] | 0) + (l << 2)) >> 2] = g;
        c[(g + 44) >> 2] = c[b >> 2];
        i = f;
        return g | 0;
    }
    function fh(a, b, d, e) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0;
        f = i;
        g = c[a >> 2] | 0;
        if ((g | 0) <= 0) {
            h = 0;
            i = f;
            return h | 0;
        }
        j = c[(a + 8) >> 2] | 0;
        a = 0;
        a: while (1) {
            k = c[(j + (a << 2)) >> 2] | 0;
            l = c[(k + 4) >> 2] | 0;
            b: do
                if ((l | 0) > 0) {
                    m = c[k >> 2] | 0;
                    n = 0;
                    while (1) {
                        o = (n + 1) | 0;
                        if ((c[(m + (n << 2)) >> 2] | 0) == (b | 0)) break;
                        if ((o | 0) < (l | 0)) n = o;
                        else break b;
                    }
                    if ((n | 0) != -1) break a;
                }
            while (0);
            l = (a + 1) | 0;
            if ((l | 0) < (g | 0)) a = l;
            else {
                h = 0;
                p = 12;
                break;
            }
        }
        if ((p | 0) == 12) {
            i = f;
            return h | 0;
        }
        if (d) c[d >> 2] = a;
        c[e >> 2] = n;
        h = 1;
        i = f;
        return h | 0;
    }
    function gh(a) {
        a = a | 0;
        var b = 0,
            d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0;
        b = i;
        d = (a + 4) | 0;
        e = c[d >> 2] | 0;
        if ((e | 0) <= 0) {
            c[d >> 2] = 0;
            i = b;
            return;
        }
        f = e;
        e = 0;
        while (1) {
            g = c[((c[a >> 2] | 0) + (e << 2)) >> 2] | 0;
            if (!g) h = f;
            else {
                ik(c[g >> 2] | 0);
                vj(g);
                h = c[d >> 2] | 0;
            }
            e = (e + 1) | 0;
            if ((e | 0) >= (h | 0)) break;
            else f = h;
        }
        c[d >> 2] = 0;
        i = b;
        return;
    }
    function hh(a) {
        a = a | 0;
        var b = 0,
            d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0;
        b = i;
        d = (a + 4) | 0;
        e = c[d >> 2] | 0;
        if ((e | 0) <= 0) {
            c[d >> 2] = 0;
            i = b;
            return;
        }
        f = e;
        e = 0;
        while (1) {
            g = c[((c[a >> 2] | 0) + (e << 2)) >> 2] | 0;
            if (!g) h = f;
            else {
                vj(g);
                h = c[d >> 2] | 0;
            }
            e = (e + 1) | 0;
            if ((e | 0) >= (h | 0)) break;
            else f = h;
        }
        c[d >> 2] = 0;
        i = b;
        return;
    }
    function ih(a) {
        a = a | 0;
        var b = 0;
        b = c[(a + 4) >> 2] | 0;
        if ((b | 0) > 0) return ((c[a >> 2] | 0) + ((b + -1) << 2)) | 0;
        else Ra(152, 168, 111, 192);
        return 0;
    }
    function jh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0;
        d = i;
        e = (a + 8) | 0;
        f = c[e >> 2] | 0;
        if ((f | 0) >= (b | 0)) {
            i = d;
            return;
        }
        if ((f | 0) < 5) g = 5;
        else g = (((f << 2) | 0) / 3) | 0;
        f = (g | 0) < (b | 0) ? b : g;
        c[a >> 2] = jk(c[a >> 2] | 0, f << 2) | 0;
        c[e >> 2] = f;
        i = d;
        return;
    }
    function kh(a) {
        a = a | 0;
        var b = 0,
            d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0;
        b = i;
        d = (a + 8) | 0;
        e = (a + 4) | 0;
        f = c[e >> 2] | 0;
        g = c[a >> 2] | 0;
        a = c[g >> 2] | 0;
        if ((f | 0) >= (a | 0)) {
            h = 0;
            i = b;
            return h | 0;
        }
        j = c[(g + 8) >> 2] | 0;
        g = ((c[d >> 2] | 0) + 1) | 0;
        k = f;
        while (1) {
            if ((g | 0) < (c[((c[(j + (k << 2)) >> 2] | 0) + 4) >> 2] | 0)) {
                l = 5;
                break;
            }
            k = (k + 1) | 0;
            c[e >> 2] = k;
            if ((k | 0) >= (a | 0)) {
                l = 6;
                break;
            } else g = 0;
        }
        if ((l | 0) == 5) {
            c[d >> 2] = g;
            h = 1;
            i = b;
            return h | 0;
        } else if ((l | 0) == 6) {
            c[d >> 2] = -1;
            h = 0;
            i = b;
            return h | 0;
        }
        return 0;
    }
    function lh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0;
        d = i;
        e = (a + 8) | 0;
        f = c[e >> 2] | 0;
        if ((f | 0) >= (b | 0)) {
            i = d;
            return;
        }
        if ((f | 0) < 5) g = 5;
        else g = (((f << 2) | 0) / 3) | 0;
        f = (g | 0) < (b | 0) ? b : g;
        c[a >> 2] = jk(c[a >> 2] | 0, f << 2) | 0;
        c[e >> 2] = f;
        i = d;
        return;
    }
    function mh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0;
        d = i;
        e = (a + 8) | 0;
        f = c[e >> 2] | 0;
        if ((f | 0) >= (b | 0)) {
            i = d;
            return;
        }
        if ((f | 0) < 5) g = 5;
        else g = (((f << 2) | 0) / 3) | 0;
        f = (g | 0) < (b | 0) ? b : g;
        c[a >> 2] = jk(c[a >> 2] | 0, f << 2) | 0;
        c[e >> 2] = f;
        i = d;
        return;
    }
    function nh(a) {
        a = +a;
        var b = 0.0,
            c = 0.0;
        if (!(a <= 0.5)) {
            b = (1.0 - a) * 2.0;
            c = b * b;
        } else {
            b = a * 2.0;
            c = b * b;
        }
        return +c;
    }
    function oh(b, d) {
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0;
        e = i;
        f = tj(148) | 0;
        if ((b | 0) == 2) {
            zg(f, 7, 7);
            g = tj(148) | 0;
            zg(g, 7, 7);
            a[(f + 64) >> 0] = 0;
            a[(g + 64) >> 0] = 0;
            c[(f + 60) >> 2] = 21;
            c[(g + 60) >> 2] = 21;
            c[(f + 112) >> 2] = g;
            c[(g + 112) >> 2] = f;
            Bg(f, d);
            Bg(g, d);
            h = f;
            i = e;
            return h | 0;
        }
        zg(f, 7, 8);
        switch (b | 0) {
            case 7: {
                c[(f + 68) >> 2] = 1;
                a[(f + 67) >> 0] = 1;
                break;
            }
            case 3: {
                c[(f + 60) >> 2] = 30;
                break;
            }
            case 5: {
                a[(f + 65) >> 0] = 1;
                break;
            }
            case 9: {
                a[(f + 67) >> 0] = 1;
                break;
            }
            case 6: {
                a[(f + 66) >> 0] = 1;
                break;
            }
            case 10: {
                c[(f + 68) >> 2] = 2;
                break;
            }
            case 0: {
                b = tj(148) | 0;
                zg(b, 7, 8);
                c[(b + 100) >> 2] = 6;
                ch(b, 200, 0, 3) | 0;
                ch(b, 400, 0, 2) | 0;
                ch(b, 0, 0, 2) | 0;
                ch(b, 1e3, 0, 5) | 0;
                ch(b, 1200, 0, 4) | 0;
                ch(b, 1200, 200, 6) | 0;
                h = b;
                i = e;
                return h | 0;
            }
            case 4: {
                a[(f + 58) >> 0] = 1;
                a[(f + 64) >> 0] = 0;
                break;
            }
            case 8: {
                c[(f + 40) >> 2] = 105;
                c[(f + 68) >> 2] = 3;
                c[(f + 104) >> 2] = 15;
                c[(f + 100) >> 2] = 20;
                b = 0;
                do {
                    Yg(f, 1, 999) | 0;
                    b = (b + 1) | 0;
                } while ((b | 0) != 13);
                h = f;
                i = e;
                return h | 0;
            }
            default: {
            }
        }
        Bg(f, d);
        h = f;
        i = e;
        return h | 0;
    }
    function ph(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0,
            d = 0,
            e = 0,
            f = 0;
        c = i;
        d = ((((a | 0) / 5) | 0) + -1) | 0;
        e = (a | 0) < 5;
        if ((b | 0) == 30)
            if (e) f = 0;
            else f = (d | 0) > 5 ? 5 : d;
        else if (e) f = 0;
        else f = (d | 0) > 3 ? 3 : d;
        i = c;
        return f | 0;
    }
    function qh(a, b, d, e) {
        a = a | 0;
        b = b | 0;
        d = +d;
        e = +e;
        var f = 0,
            h = 0,
            j = 0;
        f = i;
        h = (a + 4) | 0;
        j = (a + 8) | 0;
        rh(h, ((c[j >> 2] | 0) + 1) | 0);
        a = c[j >> 2] | 0;
        c[j >> 2] = a + 1;
        j = c[h >> 2] | 0;
        g[(j + ((a * 36) | 0)) >> 2] = d;
        g[(j + ((a * 36) | 0) + 4) >> 2] = e;
        g[(j + ((a * 36) | 0) + 8) >> 2] = 0.0;
        g[(j + ((a * 36) | 0) + 12) >> 2] = 0.0;
        c[(j + ((a * 36) | 0) + 16) >> 2] = b;
        g[(j + ((a * 36) | 0) + 20) >> 2] = 1.0;
        g[(j + ((a * 36) | 0) + 24) >> 2] = 0.0;
        g[(j + ((a * 36) | 0) + 28) >> 2] = 0.0;
        g[(j + ((a * 36) | 0) + 32) >> 2] = 0.0;
        i = f;
        return;
    }
    function rh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0;
        d = i;
        e = (a + 8) | 0;
        f = c[e >> 2] | 0;
        if ((f | 0) >= (b | 0)) {
            i = d;
            return;
        }
        if ((f | 0) < 5) g = 5;
        else g = (((f << 2) | 0) / 3) | 0;
        f = (g | 0) < (b | 0) ? b : g;
        c[a >> 2] = jk(c[a >> 2] | 0, (f * 36) | 0) | 0;
        c[e >> 2] = f;
        i = d;
        return;
    }
    function sh(a) {
        a = a | 0;
        db(a | 0) | 0;
        Bj();
    }
    function th(a) {
        a = a | 0;
        var b = 0;
        b = i;
        Ud(a | 0) | 0;
        i = b;
        return;
    }
    function uh(b, d) {
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0;
        e = i;
        f = (b + 4) | 0;
        if (!(a[f >> 0] | 0)) {
            vh(b);
            g = 3;
        }
        while (1) {
            if ((g | 0) == 3 ? ((g = 0), (a[f >> 0] | 0) == 0) : 0) {
                h = 0;
                g = 8;
                break;
            }
            j = (b + 8) | 0;
            k = c[j >> 2] | 0;
            if ((k | 0) > (d | 0)) {
                h = 0;
                g = 8;
                break;
            }
            if ((k | 0) == (d | 0)) {
                g = 6;
                break;
            }
            vh(b);
            g = 3;
        }
        if ((g | 0) == 6) {
            a[f >> 0] = 0;
            h = j;
            i = e;
            return h | 0;
        } else if ((g | 0) == 8) {
            i = e;
            return h | 0;
        }
        return 0;
    }
    function vh(b) {
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0;
        d = i;
        i = (i + 16) | 0;
        e = d;
        f = (b + 4) | 0;
        a[f >> 0] = 0;
        if (!(Eh(c[b >> 2] | 0, (b + 8) | 0) | 0)) {
            i = d;
            return;
        }
        if (!(Dh(c[b >> 2] | 0, e) | 0)) {
            i = d;
            return;
        }
        g = c[e >> 2] | 0;
        c[(b + 12) >> 2] = g;
        if ((g | 0) != 2) {
            if (!(Eh(c[b >> 2] | 0, (b + 16) | 0) | 0)) {
                i = d;
                return;
            }
            if (!(Eh(c[b >> 2] | 0, (b + 20) | 0) | 0)) {
                i = d;
                return;
            }
        } else {
            g = (b + 16) | 0;
            c[g >> 2] = 0;
            c[(g + 4) >> 2] = 0;
        }
        a[f >> 0] = 1;
        i = d;
        return;
    }
    function wh(a) {
        a = a | 0;
        var b = 0;
        b = i;
        Ud(a | 0) | 0;
        i = b;
        return;
    }
    function xh(a, b, d, e) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0;
        f = i;
        Gh(c[a >> 2] | 0, b);
        Fh(c[a >> 2] | 0, 0);
        Gh(c[a >> 2] | 0, d);
        Gh(c[a >> 2] | 0, e);
        i = f;
        return;
    }
    function yh(a, b, d, e) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0;
        f = i;
        Gh(c[a >> 2] | 0, b);
        Fh(c[a >> 2] | 0, 1);
        Gh(c[a >> 2] | 0, d);
        Gh(c[a >> 2] | 0, e);
        i = f;
        return;
    }
    function zh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0;
        d = i;
        Gh(c[a >> 2] | 0, b);
        Fh(c[a >> 2] | 0, 2);
        i = d;
        return;
    }
    function Ah(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        f = c[b >> 2] | 0;
        g = (a - f) | 0;
        h = (g | 0) > -1 ? g : (0 - g) | 0;
        g = c[d >> 2] | 0;
        if ((h | 0) > (g | 0)) {
            c[b >> 2] = ((f | 0) < (a | 0) ? g : (0 - g) | 0) + f;
            j = 0;
            c[d >> 2] = j;
            i = e;
            return;
        } else {
            c[b >> 2] = a;
            j = ((c[d >> 2] | 0) - h) | 0;
            c[d >> 2] = j;
            i = e;
            return;
        }
    }
    function Bh(a) {
        a = a | 0;
        var b = 0;
        b = i;
        c[a >> 2] = lk() | 0;
        i = b;
        return;
    }
    function Ch(a) {
        a = a | 0;
        var b = 0;
        b = ((aa(c[a >> 2] | 0, 1103515245) | 0) + 12345) | 0;
        c[a >> 2] = b;
        return b | 0;
    }
    function Dh(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0,
            d = 0;
        c = i;
        d = (rb(b | 0, 4, 1, a | 0) | 0) == 1;
        i = c;
        return d | 0;
    }
    function Eh(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0,
            d = 0;
        c = i;
        d = (rb(b | 0, 4, 1, a | 0) | 0) == 1;
        i = c;
        return d | 0;
    }
    function Fh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0;
        d = i;
        i = (i + 16) | 0;
        e = d;
        c[e >> 2] = b;
        $e(e | 0, 4, 1, a | 0) | 0;
        i = d;
        return;
    }
    function Gh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0;
        d = i;
        i = (i + 16) | 0;
        e = d;
        c[e >> 2] = b;
        $e(e | 0, 4, 1, a | 0) | 0;
        i = d;
        return;
    }
    function Hh(a, b) {
        a = a | 0;
        b = b | 0;
        c[(a + 4) >> 2] = b;
        c[a >> 2] = 0;
        return;
    }
    function Ih(b) {
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0;
        d = i;
        e = c[b >> 2] | 0;
        a: do
            if ((e | 0) == 5) {
                if (a[((c[(b + 4) >> 2] | 0) + 74) >> 0] | 0) c[b >> 2] = 6;
            } else if ((e | 0) != 7) {
                f = c[(b + 4) >> 2] | 0;
                g[(f + 52) >> 2] = 1.0;
                switch (e | 0) {
                    case 3: {
                        if ((c[(f + 76) >> 2] | 0) <= 6) break a;
                        c[b >> 2] = 4;
                        break a;
                        break;
                    }
                    case 2: {
                        if ((c[(f + 76) >> 2] | 0) <= 3) break a;
                        c[b >> 2] = 3;
                        break a;
                        break;
                    }
                    case 0: {
                        if ((c[(f + 76) >> 2] | 0) <= 1) break a;
                        c[b >> 2] = 1;
                        break a;
                        break;
                    }
                    case 4: {
                        if (!(a[(f + 74) >> 0] | 0)) break a;
                        c[b >> 2] = 5;
                        break a;
                        break;
                    }
                    case 6: {
                        if (!(a[(f + 74) >> 0] | 0)) break a;
                        c[b >> 2] = 7;
                        break a;
                        break;
                    }
                    case 1: {
                        if ((c[(f + 76) >> 2] | 0) <= 2) break a;
                        c[b >> 2] = 2;
                        break a;
                        break;
                    }
                    default:
                        break a;
                }
            }
        while (0);
        i = d;
        return;
    }
    function Jh(a) {
        a = a | 0;
        return ((c[a >> 2] | 0) == 7) | 0;
    }
    function Kh(a, d) {
        a = a | 0;
        d = d | 0;
        c[a >> 2] = 0;
        c[(a + 4) >> 2] = 0;
        c[(a + 8) >> 2] = 0;
        c[(a + 12) >> 2] = d;
        d = (a + 16) | 0;
        c[(d + 0) >> 2] = 0;
        c[(d + 4) >> 2] = 0;
        b[(d + 8) >> 1] = 0;
        c[(a + 32) >> 2] = -1;
        c[(a + 28) >> 2] = -1;
        return;
    }
    function Lh(b) {
        b = b | 0;
        a[(b + 24) >> 0] = 0;
        a[(b + 25) >> 0] = 0;
        c[(b + 32) >> 2] = -1;
        c[(b + 28) >> 2] = -1;
        return;
    }
    function Mh(b) {
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0.0,
            o = 0;
        d = i;
        e = (b + 12) | 0;
        f = c[e >> 2] | 0;
        h = c[(f + 76) >> 2] | 0;
        if ((h | 0) > 0) {
            j = c[(f + 100) >> 2] | 0;
            k = c[(f + 60) >> 2] | 0;
            l = ph(j, k) | 0;
            if ((l | 0) == (ph(c[(f + 88) >> 2] | 0, k) | 0)) m = k;
            else {
                c[(b + 20) >> 2] = j;
                g[(b + 16) >> 2] = 0.0;
                m = k;
            }
        } else m = c[(f + 60) >> 2] | 0;
        if ((h | 0) == (m | 0)) {
            m = (b + 4) | 0;
            Qh(b, ((c[m >> 2] | 0) + 1) | 0);
            h = c[m >> 2] | 0;
            c[m >> 2] = h + 1;
            m = (f + 80) | 0;
            f = c[(m + 4) >> 2] | 0;
            k = ((c[b >> 2] | 0) + (h << 3)) | 0;
            c[k >> 2] = c[m >> 2];
            c[(k + 4) >> 2] = f;
        }
        f = (b + 20) | 0;
        if ((c[f >> 2] | 0) > 0 ? ((k = (b + 16) | 0), (n = +g[k >> 2] + 0.03333333333333333), (g[k >> 2] = n), n >= 1.0) : 0) c[f >> 2] = 0;
        f = c[e >> 2] | 0;
        if (a[(f + 72) >> 0] | 0) a[(b + 24) >> 0] = 1;
        if (a[(f + 75) >> 0] | 0) a[(b + 24) >> 0] = 1;
        e = c[(f + 76) >> 2] | 0;
        if ((e | 0) <= 0) {
            i = d;
            return;
        }
        k = c[(f + 60) >> 2] | 0;
        m = ph(c[(f + 100) >> 2] | 0, k) | 0;
        if (((m | 0) != (ph(c[(f + 88) >> 2] | 0, k) | 0)) | ((e | 0) == (k | 0))) {
            e = (m + -1) | 0;
            f = ((k | 0) == 30) & ((e | 0) > 1) ? m : e;
            e = (b + 32) | 0;
            h = c[e >> 2] | 0;
            c[e >> 2] = (h | 0) > (f | 0) ? h : f;
            i = d;
            return;
        }
        if (((k | 0) == 30) & ((m | 0) > 2)) {
            k = (m + 1) | 0;
            o = (k | 0) == 5 ? 3 : k;
        } else o = m;
        m = (b + 28) | 0;
        b = c[m >> 2] | 0;
        c[m >> 2] = (b | 0) > (o | 0) ? b : o;
        i = d;
        return;
    }
    function Nh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0.0;
        d = i;
        if ((c[(a + 20) >> 2] | 0) != (b | 0)) {
            e = 1.0;
            i = d;
            return +e;
        }
        e = +nh(+g[(a + 16) >> 2]) + 1.0;
        i = d;
        return +e;
    }
    function Oh(a) {
        a = a | 0;
        return ((c[(a + 4) >> 2] | 0) > 0) | 0;
    }
    function Ph(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0;
        d = i;
        e = c[b >> 2] | 0;
        f = e;
        g = c[(f + 4) >> 2] | 0;
        h = a;
        c[h >> 2] = c[f >> 2];
        c[(h + 4) >> 2] = g;
        g = (b + 4) | 0;
        yk(e | 0, (e + 8) | 0, ((c[g >> 2] << 3) + -8) | 0) | 0;
        c[g >> 2] = (c[g >> 2] | 0) + -1;
        i = d;
        return;
    }
    function Qh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0;
        d = i;
        e = (a + 8) | 0;
        f = c[e >> 2] | 0;
        if ((f | 0) >= (b | 0)) {
            i = d;
            return;
        }
        if ((f | 0) < 5) g = 5;
        else g = (((f << 2) | 0) / 3) | 0;
        f = (g | 0) < (b | 0) ? b : g;
        c[a >> 2] = jk(c[a >> 2] | 0, f << 3) | 0;
        c[e >> 2] = f;
        i = d;
        return;
    }
    function Rh() {
        var a = 0,
            b = 0;
        a = i;
        b = oh(1, 5) | 0;
        i = a;
        return b | 0;
    }
    function Sh() {
        var a = 0,
            b = 0;
        a = i;
        b = oh(0, 5) | 0;
        i = a;
        return b | 0;
    }
    function Th() {
        var a = 0,
            b = 0;
        a = i;
        b = oh(7, 5) | 0;
        i = a;
        return b | 0;
    }
    function Uh() {
        var b = 0,
            d = 0,
            e = 0;
        b = i;
        Gd(976, 200, 2072, 1, 2064, 11);
        Yh(208, 0);
        Yh(216, 4);
        Lc(976);
        Gc(1368, 1376, 2032, 0, 2008, 2, 1064, 0, 1064, 0, 224, 2e3, 12);
        d = tj(4) | 0;
        c[d >> 2] = 0;
        e = tj(4) | 0;
        c[e >> 2] = 0;
        xc(1368, 232, 4928, 1992, 1, d | 0, 4928, 1984, 1, e | 0);
        e = tj(4) | 0;
        c[e >> 2] = 4;
        d = tj(4) | 0;
        c[d >> 2] = 4;
        xc(1368, 240, 976, 1976, 2, e | 0, 976, 1968, 2, d | 0);
        d = tj(8) | 0;
        a[d >> 0] = 3;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(1368, 248, 3, 1952, 1944, 4, d | 0, 0);
        Gc(1472, 1864, 1928, 0, 1904, 3, 1064, 0, 1064, 0, 256, 1896, 13);
        d = tj(8) | 0;
        a[d >> 0] = 4;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(1472, 272, 2, 1888, 1880, 4, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 5;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(1472, 280, 2, 1840, 1832, 5, d | 0, 0);
        Gd(1728, 288, 1824, 2, 1816, 14);
        mi(208, 0);
        mi(216, 4);
        mi(304, 20);
        Lc(1728);
        Gc(1568, 1576, 1784, 0, 1760, 6, 1064, 0, 1064, 0, 312, 1752, 15);
        d = tj(8) | 0;
        a[d >> 0] = 7;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(1568, 328, 2, 1744, 1736, 6, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 3;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(1568, 336, 3, 1696, 1688, 5, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 16;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(1568, 344, 2, 1680, 1672, 1, d | 0, 0);
        Gc(856, 864, 1656, 0, 1632, 8, 1064, 0, 1064, 0, 352, 1624, 17);
        d = tj(4) | 0;
        c[d >> 2] = 52;
        e = tj(4) | 0;
        c[e >> 2] = 52;
        xc(856, 360, 4992, 1616, 1, d | 0, 4992, 1608, 1, e | 0);
        e = tj(4) | 0;
        c[e >> 2] = 100;
        d = tj(4) | 0;
        c[d >> 2] = 100;
        xc(856, 384, 4928, 1600, 7, e | 0, 4928, 1592, 4, d | 0);
        d = tj(8) | 0;
        a[d >> 0] = 9;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(856, 392, 2, 1528, 1520, 8, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 18;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(856, 408, 2, 1512, 1504, 2, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 9;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(856, 416, 3, 1488, 1480, 6, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 3;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(856, 424, 2, 1448, 1440, 10, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 5;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(856, 432, 3, 1424, 1416, 7, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 4;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(856, 448, 3, 1400, 1392, 6, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 19;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(856, 464, 2, 1512, 1504, 2, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 5;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(856, 472, 3, 1336, 1328, 7, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 10;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(856, 480, 2, 1320, 1312, 11, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 11;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(856, 496, 2, 1320, 1312, 11, d | 0, 0);
        Gc(1184, 1192, 1296, 0, 1264, 12, 1064, 0, 1064, 0, 504, 1256, 20);
        Ab(1184, 2, 1248, 1240, 12, 13);
        d = tj(8) | 0;
        a[d >> 0] = 21;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(1184, 528, 2, 1232, 1224, 6, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 14;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(1184, 544, 2, 1216, 1208, 13, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 15;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(1184, 560, 2, 1128, 1120, 14, d | 0, 0);
        Gc(928, 936, 1104, 0, 1072, 16, 1064, 0, 1064, 0, 576, 1056, 22);
        Ab(928, 2, 1048, 1040, 15, 17);
        d = tj(8) | 0;
        a[d >> 0] = 23;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(928, 528, 2, 1032, 1024, 7, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 2;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(928, 592, 3, 1008, 1e3, 1, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 18;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(928, 608, 2, 992, 984, 16, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 8;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(928, 624, 2, 960, 952, 17, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 19;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(928, 648, 2, 992, 984, 16, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 20;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(928, 664, 2, 992, 984, 16, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 21;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(928, 680, 2, 888, 880, 18, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 22;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(928, 696, 2, 888, 880, 18, d | 0, 0);
        d = tj(8) | 0;
        a[d >> 0] = 24;
        a[(d + 1) >> 0] = 0;
        a[(d + 2) >> 0] = 0;
        a[(d + 3) >> 0] = 0;
        e = (d + 4) | 0;
        a[e >> 0] = 0;
        a[(e + 1) >> 0] = 0;
        a[(e + 2) >> 0] = 0;
        a[(e + 3) >> 0] = 0;
        Pd(928, 712, 2, 1032, 1024, 7, d | 0, 0);
        Je(728, 1, 816, 808, 23, 3);
        Je(744, 1, 816, 808, 23, 4);
        Je(768, 1, 816, 808, 23, 5);
        Je(784, 2, 800, 792, 9, 25);
        i = b;
        return;
    }
    function Vh() {
        var a = 0;
        a = i;
        Uh();
        i = a;
        return;
    }
    function Wh() {
        var a = 0,
            b = 0;
        a = i;
        b = tj(8) | 0;
        c[b >> 2] = 0;
        c[(b + 4) >> 2] = 0;
        i = a;
        return b | 0;
    }
    function Xh(a) {
        a = a | 0;
        var b = 0;
        b = i;
        if (a) vj(a);
        i = b;
        return;
    }
    function Yh(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0;
        d = i;
        e = tj(4) | 0;
        c[e >> 2] = b;
        f = tj(4) | 0;
        c[f >> 2] = b;
        bc(976, a | 0, 4928, 2056, 19, e | 0, 4928, 2048, 8, f | 0);
        i = d;
        return;
    }
    function Zh(a) {
        a = a | 0;
        return 1368;
    }
    function _h(a) {
        a = a | 0;
        var b = 0;
        b = i;
        if (a) vj(a);
        i = b;
        return;
    }
    function $h(a, b) {
        a = a | 0;
        b = b | 0;
        return c[(b + (c[a >> 2] | 0)) >> 2] | 0;
    }
    function ai(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        c[(b + (c[a >> 2] | 0)) >> 2] = d;
        return;
    }
    function bi(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0;
        d = i;
        e = (b + (c[a >> 2] | 0)) | 0;
        a = tj(8) | 0;
        b = e;
        e = c[(b + 4) >> 2] | 0;
        f = a;
        c[f >> 2] = c[b >> 2];
        c[(f + 4) >> 2] = e;
        i = d;
        return a | 0;
    }
    function ci(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0;
        e = d;
        d = c[(e + 4) >> 2] | 0;
        f = (b + (c[a >> 2] | 0)) | 0;
        c[f >> 2] = c[e >> 2];
        c[(f + 4) >> 2] = d;
        return;
    }
    function di(a, b) {
        a = a | 0;
        b = b | 0;
        return c[(a + (b << 2) + 28) >> 2] | 0;
    }
    function ei(a, b, e) {
        a = a | 0;
        b = b | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0;
        f = i;
        g = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        h = (a + 4) | 0;
        a = d[h >> 0] | (d[(h + 1) >> 0] << 8) | (d[(h + 2) >> 0] << 16) | (d[(h + 3) >> 0] << 24);
        h = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            j = g;
            k = gg[j & 31](h, e) | 0;
            i = f;
            return k | 0;
        } else {
            j = c[((c[h >> 2] | 0) + g) >> 2] | 0;
            k = gg[j & 31](h, e) | 0;
            i = f;
            return k | 0;
        }
        return 0;
    }
    function fi(a) {
        a = a | 0;
        return 1472;
    }
    function gi(a) {
        a = a | 0;
        var b = 0;
        b = i;
        if (a) vj(a);
        i = b;
        return;
    }
    function hi(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        }
        return 0;
    }
    function ii(a) {
        a = a | 0;
        return c[((c[c[((c[((c[a >> 2] | 0) + 8) >> 2] | 0) + (c[(a + 4) >> 2] << 2)) >> 2] >> 2] | 0) + (c[(a + 8) >> 2] << 2)) >> 2] | 0;
    }
    function ji(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        }
        return 0;
    }
    function ki() {
        var a = 0,
            b = 0,
            d = 0,
            e = 0;
        a = i;
        b = tj(36) | 0;
        d = (b + 0) | 0;
        e = (d + 36) | 0;
        do {
            c[d >> 2] = 0;
            d = (d + 4) | 0;
        } while ((d | 0) < (e | 0));
        i = a;
        return b | 0;
    }
    function li(a) {
        a = a | 0;
        var b = 0;
        b = i;
        if (a) vj(a);
        i = b;
        return;
    }
    function mi(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0;
        d = i;
        e = tj(4) | 0;
        c[e >> 2] = b;
        f = tj(4) | 0;
        c[f >> 2] = b;
        bc(1728, a | 0, 4992, 1808, 3, e | 0, 4992, 1800, 2, f | 0);
        i = d;
        return;
    }
    function ni(a) {
        a = a | 0;
        return 1568;
    }
    function oi(a) {
        a = a | 0;
        var b = 0;
        b = i;
        if (!a) {
            i = b;
            return;
        }
        ik(c[(a + 4) >> 2] | 0);
        vj(a);
        i = b;
        return;
    }
    function pi(a) {
        a = a | 0;
        return c[(a + 8) >> 2] | 0;
    }
    function qi(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        }
        return 0;
    }
    function ri(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0;
        e = i;
        f = (a + 0) | 0;
        a = ((c[(b + 4) >> 2] | 0) + ((d * 36) | 0) + 0) | 0;
        d = (f + 36) | 0;
        do {
            c[f >> 2] = c[a >> 2];
            f = (f + 4) | 0;
            a = (a + 4) | 0;
        } while ((f | 0) < (d | 0));
        i = e;
        return;
    }
    function si(a, b, e) {
        a = a | 0;
        b = b | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0;
        f = i;
        i = (i + 48) | 0;
        g = f;
        h = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        j = (a + 4) | 0;
        a = d[j >> 0] | (d[(j + 1) >> 0] << 8) | (d[(j + 2) >> 0] << 16) | (d[(j + 3) >> 0] << 24);
        j = (b + (a >> 1)) | 0;
        if (!(a & 1)) k = h;
        else k = c[((c[j >> 2] | 0) + h) >> 2] | 0;
        mg[k & 63](g, j, e);
        e = tj(36) | 0;
        j = (e + 0) | 0;
        k = (g + 0) | 0;
        g = (j + 36) | 0;
        do {
            c[j >> 2] = c[k >> 2];
            j = (j + 4) | 0;
            k = (k + 4) | 0;
        } while ((j | 0) < (g | 0));
        i = f;
        return e | 0;
    }
    function ti(a) {
        a = a | 0;
        c[(a + 8) >> 2] = 0;
        return;
    }
    function ui(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            Vf[h & 63](g);
            i = e;
            return;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            Vf[h & 63](g);
            i = e;
            return;
        }
    }
    function vi(a) {
        a = a | 0;
        return 856;
    }
    function wi(a) {
        a = a | 0;
        var b = 0;
        b = i;
        if (a) {
            Ag(a);
            vj(a);
        }
        i = b;
        return;
    }
    function xi(a, b) {
        a = a | 0;
        b = b | 0;
        return +(+g[(b + (c[a >> 2] | 0)) >> 2]);
    }
    function yi(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = +d;
        g[(b + (c[a >> 2] | 0)) >> 2] = d;
        return;
    }
    function zi(a, b) {
        a = a | 0;
        b = b | 0;
        return c[(b + (c[a >> 2] | 0)) >> 2] | 0;
    }
    function Ai(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        c[(b + (c[a >> 2] | 0)) >> 2] = d;
        return;
    }
    function Bi(a) {
        a = a | 0;
        return (a + 24) | 0;
    }
    function Ci(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        }
        return 0;
    }
    function Di(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            Vf[h & 63](g);
            i = e;
            return;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            Vf[h & 63](g);
            i = e;
            return;
        }
    }
    function Ei(a, b, e) {
        a = a | 0;
        b = b | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0;
        f = i;
        i = (i + 16) | 0;
        g = (f + 8) | 0;
        h = f;
        j = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        k = (a + 4) | 0;
        a = d[k >> 0] | (d[(k + 1) >> 0] << 8) | (d[(k + 2) >> 0] << 16) | (d[(k + 3) >> 0] << 24);
        k = (b + (a >> 1)) | 0;
        if (!(a & 1)) l = j;
        else l = c[((c[k >> 2] | 0) + j) >> 2] | 0;
        j = e;
        e = c[(j + 4) >> 2] | 0;
        a = h;
        c[a >> 2] = c[j >> 2];
        c[(a + 4) >> 2] = e;
        c[(g + 0) >> 2] = c[(h + 0) >> 2];
        c[(g + 4) >> 2] = c[(h + 4) >> 2];
        h = gg[l & 31](k, g) | 0;
        i = f;
        return h | 0;
    }
    function Fi(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        i = (i + 16) | 0;
        f = e;
        g = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        h = (a + 4) | 0;
        a = d[h >> 0] | (d[(h + 1) >> 0] << 8) | (d[(h + 2) >> 0] << 16) | (d[(h + 3) >> 0] << 24);
        h = (b + (a >> 1)) | 0;
        if (!(a & 1)) j = g;
        else j = c[((c[h >> 2] | 0) + g) >> 2] | 0;
        Wf[j & 63](f, h);
        h = tj(12) | 0;
        c[(h + 0) >> 2] = c[(f + 0) >> 2];
        c[(h + 4) >> 2] = c[(f + 4) >> 2];
        c[(h + 8) >> 2] = c[(f + 8) >> 2];
        i = e;
        return h | 0;
    }
    function Gi(a, b, e) {
        a = a | 0;
        b = b | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0;
        f = i;
        i = (i + 16) | 0;
        g = f;
        h = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        j = (a + 4) | 0;
        a = d[j >> 0] | (d[(j + 1) >> 0] << 8) | (d[(j + 2) >> 0] << 16) | (d[(j + 3) >> 0] << 24);
        j = (b + (a >> 1)) | 0;
        if (!(a & 1)) k = h;
        else k = c[((c[j >> 2] | 0) + h) >> 2] | 0;
        mg[k & 63](g, j, e);
        e = tj(8) | 0;
        j = g;
        g = c[(j + 4) >> 2] | 0;
        k = e;
        c[k >> 2] = c[j >> 2];
        c[(k + 4) >> 2] = g;
        i = f;
        return e | 0;
    }
    function Hi(a, b, e) {
        a = a | 0;
        b = b | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0;
        f = i;
        i = (i + 16) | 0;
        g = (f + 8) | 0;
        h = f;
        j = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        k = (a + 4) | 0;
        a = d[k >> 0] | (d[(k + 1) >> 0] << 8) | (d[(k + 2) >> 0] << 16) | (d[(k + 3) >> 0] << 24);
        k = (b + (a >> 1)) | 0;
        if (!(a & 1)) l = j;
        else l = c[((c[k >> 2] | 0) + j) >> 2] | 0;
        j = e;
        e = c[(j + 4) >> 2] | 0;
        a = h;
        c[a >> 2] = c[j >> 2];
        c[(a + 4) >> 2] = e;
        c[(g + 0) >> 2] = c[(h + 0) >> 2];
        c[(g + 4) >> 2] = c[(h + 4) >> 2];
        Wf[l & 63](k, g);
        i = f;
        return;
    }
    function Ii(a, b, e) {
        a = a | 0;
        b = b | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0;
        f = i;
        g = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        h = (a + 4) | 0;
        a = d[h >> 0] | (d[(h + 1) >> 0] << 8) | (d[(h + 2) >> 0] << 16) | (d[(h + 3) >> 0] << 24);
        h = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            j = g;
            Wf[j & 63](h, e);
            i = f;
            return;
        } else {
            j = c[((c[h >> 2] | 0) + g) >> 2] | 0;
            Wf[j & 63](h, e);
            i = f;
            return;
        }
    }
    function Ji(b) {
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0;
        d = i;
        if (!(a[(b + 108) >> 0] | 0)) {
            e = c[(b + 112) >> 2] | 0;
            if (!e) f = 0;
            else f = (a[(e + 108) >> 0] | 0) != 0;
        } else f = 1;
        i = d;
        return f | 0;
    }
    function Ki(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        }
        return 0;
    }
    function Li(a) {
        a = a | 0;
        return 1184;
    }
    function Mi(a) {
        a = a | 0;
        var b = 0;
        b = i;
        if (a) vj(a);
        i = b;
        return;
    }
    function Ni(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0;
        d = i;
        i = (i + 16) | 0;
        e = d;
        c[e >> 2] = b;
        b = Xf[a & 63](e) | 0;
        i = d;
        return b | 0;
    }
    function Oi(a) {
        a = a | 0;
        var b = 0,
            d = 0;
        b = i;
        d = tj(8) | 0;
        Hh(d, c[a >> 2] | 0);
        i = b;
        return d | 0;
    }
    function Pi(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            Vf[h & 63](g);
            i = e;
            return;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            Vf[h & 63](g);
            i = e;
            return;
        }
    }
    function Qi(a) {
        a = a | 0;
        return c[a >> 2] | 0;
    }
    function Ri(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        }
        return 0;
    }
    function Si(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        }
        return 0;
    }
    function Ti(a) {
        a = a | 0;
        return 928;
    }
    function Ui(a) {
        a = a | 0;
        var b = 0;
        b = i;
        if (a) {
            ik(c[a >> 2] | 0);
            vj(a);
        }
        i = b;
        return;
    }
    function Vi(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0;
        d = i;
        i = (i + 16) | 0;
        e = d;
        c[e >> 2] = b;
        b = Xf[a & 63](e) | 0;
        i = d;
        return b | 0;
    }
    function Wi(a) {
        a = a | 0;
        var b = 0,
            d = 0;
        b = i;
        d = tj(36) | 0;
        Kh(d, c[a >> 2] | 0);
        i = b;
        return d | 0;
    }
    function Xi(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            Vf[h & 63](g);
            i = e;
            return;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            Vf[h & 63](g);
            i = e;
            return;
        }
    }
    function Yi(a, b, e) {
        a = a | 0;
        b = b | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0.0;
        f = i;
        g = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        h = (a + 4) | 0;
        a = d[h >> 0] | (d[(h + 1) >> 0] << 8) | (d[(h + 2) >> 0] << 16) | (d[(h + 3) >> 0] << 24);
        h = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            j = g;
            k = +ig[j & 3](h, e);
            i = f;
            return +k;
        } else {
            j = c[((c[h >> 2] | 0) + g) >> 2] | 0;
            k = +ig[j & 3](h, e);
            i = f;
            return +k;
        }
        return +0.0;
    }
    function Zi(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        }
        return 0;
    }
    function _i(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        i = (i + 16) | 0;
        f = e;
        g = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        h = (a + 4) | 0;
        a = d[h >> 0] | (d[(h + 1) >> 0] << 8) | (d[(h + 2) >> 0] << 16) | (d[(h + 3) >> 0] << 24);
        h = (b + (a >> 1)) | 0;
        if (!(a & 1)) j = g;
        else j = c[((c[h >> 2] | 0) + g) >> 2] | 0;
        Wf[j & 63](f, h);
        h = tj(8) | 0;
        j = f;
        f = c[(j + 4) >> 2] | 0;
        g = h;
        c[g >> 2] = c[j >> 2];
        c[(g + 4) >> 2] = f;
        i = e;
        return h | 0;
    }
    function $i(b) {
        b = b | 0;
        return ((a[(b + 24) >> 0] | 0) != 0) | 0;
    }
    function aj(b) {
        b = b | 0;
        return ((a[(b + 25) >> 0] | 0) != 0) | 0;
    }
    function bj(a) {
        a = a | 0;
        return c[(a + 28) >> 2] | 0;
    }
    function cj(a, b) {
        a = a | 0;
        b = b | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
        g = (a + 4) | 0;
        a = d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
        g = (b + (a >> 1)) | 0;
        if (!(a & 1)) {
            h = f;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        } else {
            h = c[((c[g >> 2] | 0) + f) >> 2] | 0;
            j = Xf[h & 63](g) | 0;
            i = e;
            return j | 0;
        }
        return 0;
    }
    function dj(a) {
        a = a | 0;
        return c[(a + 32) >> 2] | 0;
    }
    function ej(a) {
        a = a | 0;
        var b = 0,
            c = 0;
        b = i;
        c = jg[a & 7]() | 0;
        i = b;
        return c | 0;
    }
    function fj(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0;
        c = i;
        Vf[a & 63](b);
        i = c;
        return;
    }
    function gj(a, b) {
        a = a | 0;
        b = b | 0;
        return c[(b + (c[a >> 2] | 0)) >> 2] | 0;
    }
    function hj(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        c[(b + (c[a >> 2] | 0)) >> 2] = d;
        return;
    }
    function ij(a, b) {
        a = a | 0;
        b = b | 0;
        return +(+g[(b + (c[a >> 2] | 0)) >> 2]);
    }
    function jj(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = +d;
        g[(b + (c[a >> 2] | 0)) >> 2] = d;
        return;
    }
    function kj(a) {
        a = a | 0;
        var b = 0,
            d = 0;
        b = i;
        d = pj(c[(a + 4) >> 2] | 0) | 0;
        i = b;
        return d | 0;
    }
    function lj() {
        var a = 0;
        a = i;
        Ge(4776, 2080);
        pc(4808, 2088, 1, 1, 0);
        od(4824, 2096, 1, -128, 127);
        od(4880, 2104, 1, -128, 127);
        od(4864, 2120, 1, 0, 255);
        od(4896, 2136, 2, -32768, 32767);
        od(4912, 2144, 2, 0, 65535);
        od(4928, 2160, 4, -2147483648, 2147483647);
        od(4944, 2168, 4, 0, -1);
        od(4960, 2184, 4, -2147483648, 2147483647);
        od(4976, 2192, 4, 0, -1);
        tf(4992, 2208, 4);
        tf(5008, 2216, 8);
        jb(3776, 2224);
        jb(3688, 2240);
        Ve(3600, 4, 2280);
        yc(3480, 2296);
        ze(3448, 0, 2312);
        ze(3408, 0, 2344);
        ze(3368, 1, 2384);
        ze(3328, 2, 2424);
        ze(3288, 3, 2456);
        ze(3248, 4, 2496);
        ze(3208, 5, 2528);
        ze(3168, 4, 2568);
        ze(3128, 5, 2600);
        ze(3408, 0, 2640);
        ze(3368, 1, 2672);
        ze(3328, 2, 2712);
        ze(3288, 3, 2752);
        ze(3248, 4, 2792);
        ze(3208, 5, 2832);
        ze(3088, 6, 2872);
        ze(3048, 7, 2904);
        ze(3008, 7, 2936);
        i = a;
        return;
    }
    function mj() {
        var a = 0;
        a = i;
        lj();
        i = a;
        return;
    }
    function nj(b, c) {
        b = b | 0;
        c = c | 0;
        var d = 0,
            e = 0;
        d = i;
        e = oj(b, c) | 0;
        i = d;
        return ((a[e >> 0] | 0) == ((c & 255) << 24) >> 24 ? e : 0) | 0;
    }
    function oj(b, d) {
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0;
        e = i;
        f = d & 255;
        if (!f) {
            g = (b + (xk(b | 0) | 0)) | 0;
            i = e;
            return g | 0;
        }
        a: do
            if (!(b & 3)) h = b;
            else {
                j = d & 255;
                k = b;
                while (1) {
                    l = a[k >> 0] | 0;
                    m = (k + 1) | 0;
                    if ((l << 24) >> 24 == 0 ? 1 : (l << 24) >> 24 == (j << 24) >> 24) {
                        g = k;
                        break;
                    }
                    if (!(m & 3)) {
                        h = m;
                        break a;
                    } else k = m;
                }
                i = e;
                return g | 0;
            }
        while (0);
        b = aa(f, 16843009) | 0;
        f = c[h >> 2] | 0;
        b: do
            if (!(((f & -2139062144) ^ -2139062144) & (f + -16843009))) {
                k = f;
                j = h;
                while (1) {
                    m = k ^ b;
                    l = (j + 4) | 0;
                    if (((m & -2139062144) ^ -2139062144) & (m + -16843009)) {
                        n = j;
                        break b;
                    }
                    k = c[l >> 2] | 0;
                    if (((k & -2139062144) ^ -2139062144) & (k + -16843009)) {
                        n = l;
                        break;
                    } else j = l;
                }
            } else n = h;
        while (0);
        h = d & 255;
        d = n;
        while (1) {
            n = a[d >> 0] | 0;
            if ((n << 24) >> 24 == 0 ? 1 : (n << 24) >> 24 == (h << 24) >> 24) {
                g = d;
                break;
            } else d = (d + 1) | 0;
        }
        i = e;
        return g | 0;
    }
    function pj(a) {
        a = a | 0;
        var b = 0,
            c = 0,
            d = 0,
            e = 0;
        b = i;
        c = ((xk(a | 0) | 0) + 1) | 0;
        d = hk(c) | 0;
        if (!d) {
            e = 0;
            i = b;
            return e | 0;
        }
        sk(d | 0, a | 0, c | 0) | 0;
        e = d;
        i = b;
        return e | 0;
    }
    function qj(b, e) {
        b = b | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0,
            C = 0,
            D = 0,
            E = 0,
            F = 0,
            G = 0,
            H = 0,
            I = 0,
            J = 0,
            K = 0,
            L = 0,
            M = 0,
            N = 0,
            O = 0,
            P = 0,
            Q = 0,
            R = 0,
            S = 0,
            T = 0,
            U = 0,
            V = 0,
            W = 0;
        f = i;
        i = (i + 1056) | 0;
        g = (f + 1024) | 0;
        h = f;
        j = a[e >> 0] | 0;
        if (!((j << 24) >> 24)) {
            k = b;
            i = f;
            return k | 0;
        }
        l = nj(b, (j << 24) >> 24) | 0;
        if (!l) {
            k = 0;
            i = f;
            return k | 0;
        }
        b = a[(e + 1) >> 0] | 0;
        if (!((b << 24) >> 24)) {
            k = l;
            i = f;
            return k | 0;
        }
        m = (l + 1) | 0;
        n = a[m >> 0] | 0;
        if (!((n << 24) >> 24)) {
            k = 0;
            i = f;
            return k | 0;
        }
        o = a[(e + 2) >> 0] | 0;
        if (!((o << 24) >> 24)) {
            p = (b & 255) | ((j & 255) << 8);
            q = m;
            m = n;
            r = (d[l >> 0] << 8) | (n & 255);
            while (1) {
                s = r & 65535;
                if ((s | 0) == (p | 0)) {
                    t = q;
                    u = m;
                    break;
                }
                v = (q + 1) | 0;
                w = a[v >> 0] | 0;
                if (!((w << 24) >> 24)) {
                    t = v;
                    u = 0;
                    break;
                } else {
                    q = v;
                    m = w;
                    r = (w & 255) | (s << 8);
                }
            }
            k = (u << 24) >> 24 == 0 ? 0 : (t + -1) | 0;
            i = f;
            return k | 0;
        }
        t = (l + 2) | 0;
        u = a[t >> 0] | 0;
        if (!((u << 24) >> 24)) {
            k = 0;
            i = f;
            return k | 0;
        }
        r = a[(e + 3) >> 0] | 0;
        if (!((r << 24) >> 24)) {
            m = ((b & 255) << 16) | ((j & 255) << 24) | ((o & 255) << 8);
            q = ((u & 255) << 8) | ((n & 255) << 16) | (d[l >> 0] << 24);
            if ((q | 0) == (m | 0)) {
                x = t;
                y = 0;
            } else {
                p = t;
                t = q;
                while (1) {
                    q = (p + 1) | 0;
                    s = a[q >> 0] | 0;
                    t = ((s & 255) | t) << 8;
                    w = (s << 24) >> 24 == 0;
                    if (w | ((t | 0) == (m | 0))) {
                        x = q;
                        y = w;
                        break;
                    } else p = q;
                }
            }
            k = y ? 0 : (x + -2) | 0;
            i = f;
            return k | 0;
        }
        x = (l + 3) | 0;
        y = a[x >> 0] | 0;
        if (!((y << 24) >> 24)) {
            k = 0;
            i = f;
            return k | 0;
        }
        if (!(a[(e + 4) >> 0] | 0)) {
            p = ((b & 255) << 16) | ((j & 255) << 24) | ((o & 255) << 8) | (r & 255);
            r = ((u & 255) << 8) | ((n & 255) << 16) | (y & 255) | (d[l >> 0] << 24);
            if ((r | 0) == (p | 0)) {
                z = x;
                A = 0;
            } else {
                y = x;
                x = r;
                while (1) {
                    r = (y + 1) | 0;
                    n = a[r >> 0] | 0;
                    x = (n & 255) | (x << 8);
                    u = (n << 24) >> 24 == 0;
                    if (u | ((x | 0) == (p | 0))) {
                        z = r;
                        A = u;
                        break;
                    } else y = r;
                }
            }
            k = A ? 0 : (z + -3) | 0;
            i = f;
            return k | 0;
        }
        c[(g + 0) >> 2] = 0;
        c[(g + 4) >> 2] = 0;
        c[(g + 8) >> 2] = 0;
        c[(g + 12) >> 2] = 0;
        c[(g + 16) >> 2] = 0;
        c[(g + 20) >> 2] = 0;
        c[(g + 24) >> 2] = 0;
        c[(g + 28) >> 2] = 0;
        z = j;
        j = 0;
        while (1) {
            if (!(a[(l + j) >> 0] | 0)) {
                k = 0;
                B = 79;
                break;
            }
            A = (g + ((((z & 255) >>> 5) & 255) << 2)) | 0;
            c[A >> 2] = c[A >> 2] | (1 << (z & 31));
            C = (j + 1) | 0;
            c[(h + ((z & 255) << 2)) >> 2] = C;
            z = a[(e + C) >> 0] | 0;
            if (!((z << 24) >> 24)) break;
            else j = C;
        }
        if ((B | 0) == 79) {
            i = f;
            return k | 0;
        }
        a: do
            if (C >>> 0 > 1) {
                z = 1;
                A = -1;
                y = 0;
                b: while (1) {
                    p = z;
                    x = y;
                    r = 1;
                    while (1) {
                        u = p;
                        D = x;
                        c: while (1) {
                            E = u;
                            n = 1;
                            while (1) {
                                F = a[(e + (n + A)) >> 0] | 0;
                                G = a[(e + E) >> 0] | 0;
                                if ((F << 24) >> 24 != (G << 24) >> 24) break c;
                                if ((n | 0) == (r | 0)) break;
                                n = (n + 1) | 0;
                                o = (n + D) | 0;
                                if (o >>> 0 >= C >>> 0) {
                                    H = A;
                                    I = r;
                                    break b;
                                } else E = o;
                            }
                            n = (D + r) | 0;
                            u = (n + 1) | 0;
                            if (u >>> 0 >= C >>> 0) {
                                H = A;
                                I = r;
                                break b;
                            } else D = n;
                        }
                        u = (E - A) | 0;
                        if ((F & 255) <= (G & 255)) break;
                        p = (E + 1) | 0;
                        if (p >>> 0 >= C >>> 0) {
                            H = A;
                            I = u;
                            break b;
                        } else {
                            x = E;
                            r = u;
                        }
                    }
                    z = (D + 2) | 0;
                    if (z >>> 0 >= C >>> 0) {
                        H = D;
                        I = 1;
                        break;
                    } else {
                        A = D;
                        y = (D + 1) | 0;
                    }
                }
                y = 1;
                A = -1;
                z = 0;
                while (1) {
                    r = y;
                    x = z;
                    p = 1;
                    while (1) {
                        u = r;
                        J = x;
                        d: while (1) {
                            K = u;
                            n = 1;
                            while (1) {
                                L = a[(e + (n + A)) >> 0] | 0;
                                M = a[(e + K) >> 0] | 0;
                                if ((L << 24) >> 24 != (M << 24) >> 24) break d;
                                if ((n | 0) == (p | 0)) break;
                                n = (n + 1) | 0;
                                o = (n + J) | 0;
                                if (o >>> 0 >= C >>> 0) {
                                    N = H;
                                    O = A;
                                    P = I;
                                    Q = p;
                                    break a;
                                } else K = o;
                            }
                            n = (J + p) | 0;
                            u = (n + 1) | 0;
                            if (u >>> 0 >= C >>> 0) {
                                N = H;
                                O = A;
                                P = I;
                                Q = p;
                                break a;
                            } else J = n;
                        }
                        u = (K - A) | 0;
                        if ((L & 255) >= (M & 255)) break;
                        r = (K + 1) | 0;
                        if (r >>> 0 >= C >>> 0) {
                            N = H;
                            O = A;
                            P = I;
                            Q = u;
                            break a;
                        } else {
                            x = K;
                            p = u;
                        }
                    }
                    y = (J + 2) | 0;
                    if (y >>> 0 >= C >>> 0) {
                        N = H;
                        O = J;
                        P = I;
                        Q = 1;
                        break;
                    } else {
                        A = J;
                        z = (J + 1) | 0;
                    }
                }
            } else {
                N = -1;
                O = -1;
                P = 1;
                Q = 1;
            }
        while (0);
        J = ((O + 1) | 0) >>> 0 > ((N + 1) | 0) >>> 0;
        I = J ? Q : P;
        P = J ? O : N;
        N = (P + 1) | 0;
        if (!(nk(e, (e + I) | 0, N) | 0)) {
            O = (C - I) | 0;
            J = C | 63;
            if ((C | 0) != (I | 0)) {
                Q = l;
                H = 0;
                K = l;
                e: while (1) {
                    M = Q;
                    do
                        if (((K - M) | 0) >>> 0 < C >>> 0) {
                            L = mk(K, J) | 0;
                            if (L)
                                if (((L - M) | 0) >>> 0 < C >>> 0) {
                                    k = 0;
                                    B = 79;
                                    break e;
                                } else {
                                    R = L;
                                    break;
                                }
                            else {
                                R = (K + J) | 0;
                                break;
                            }
                        } else R = K;
                    while (0);
                    M = a[(Q + j) >> 0] | 0;
                    if (!((1 << (M & 31)) & c[(g + ((((M & 255) >>> 5) & 255) << 2)) >> 2])) {
                        Q = (Q + C) | 0;
                        H = 0;
                        K = R;
                        continue;
                    }
                    L = c[(h + ((M & 255) << 2)) >> 2] | 0;
                    M = (C - L) | 0;
                    if ((C | 0) != (L | 0)) {
                        Q = (Q + (((H | 0) != 0) & (M >>> 0 < I >>> 0) ? O : M)) | 0;
                        H = 0;
                        K = R;
                        continue;
                    }
                    M = N >>> 0 > H >>> 0 ? N : H;
                    L = a[(e + M) >> 0] | 0;
                    f: do
                        if (!((L << 24) >> 24)) S = N;
                        else {
                            D = L;
                            E = M;
                            while (1) {
                                G = (E + 1) | 0;
                                if ((D << 24) >> 24 != (a[(Q + E) >> 0] | 0)) break;
                                D = a[(e + G) >> 0] | 0;
                                if (!((D << 24) >> 24)) {
                                    S = N;
                                    break f;
                                } else E = G;
                            }
                            Q = (Q + (E - P)) | 0;
                            H = 0;
                            K = R;
                            continue e;
                        }
                    while (0);
                    do {
                        if (S >>> 0 <= H >>> 0) {
                            k = Q;
                            B = 79;
                            break e;
                        }
                        S = (S + -1) | 0;
                    } while ((a[(e + S) >> 0] | 0) == (a[(Q + S) >> 0] | 0));
                    Q = (Q + I) | 0;
                    H = O;
                    K = R;
                }
                if ((B | 0) == 79) {
                    i = f;
                    return k | 0;
                }
            } else {
                T = J;
                U = C;
            }
        } else {
            J = (C - P + -1) | 0;
            T = C | 63;
            U = ((P >>> 0 > J >>> 0 ? P : J) + 1) | 0;
        }
        J = (e + N) | 0;
        R = l;
        K = l;
        g: while (1) {
            l = R;
            do
                if (((K - l) | 0) >>> 0 < C >>> 0) {
                    O = mk(K, T) | 0;
                    if (O)
                        if (((O - l) | 0) >>> 0 < C >>> 0) {
                            k = 0;
                            B = 79;
                            break g;
                        } else {
                            V = O;
                            break;
                        }
                    else {
                        V = (K + T) | 0;
                        break;
                    }
                } else V = K;
            while (0);
            l = a[(R + j) >> 0] | 0;
            if (!((1 << (l & 31)) & c[(g + ((((l & 255) >>> 5) & 255) << 2)) >> 2])) {
                R = (R + C) | 0;
                K = V;
                continue;
            }
            O = c[(h + ((l & 255) << 2)) >> 2] | 0;
            if ((C | 0) != (O | 0)) {
                R = (R + (C - O)) | 0;
                K = V;
                continue;
            }
            O = a[J >> 0] | 0;
            h: do
                if (!((O << 24) >> 24)) W = N;
                else {
                    l = O;
                    H = N;
                    while (1) {
                        I = (H + 1) | 0;
                        if ((l << 24) >> 24 != (a[(R + H) >> 0] | 0)) break;
                        l = a[(e + I) >> 0] | 0;
                        if (!((l << 24) >> 24)) {
                            W = N;
                            break h;
                        } else H = I;
                    }
                    R = (R + (H - P)) | 0;
                    K = V;
                    continue g;
                }
            while (0);
            do {
                if (!W) {
                    k = R;
                    B = 79;
                    break g;
                }
                W = (W + -1) | 0;
            } while ((a[(e + W) >> 0] | 0) == (a[(R + W) >> 0] | 0));
            R = (R + U) | 0;
            K = V;
        }
        if ((B | 0) == 79) {
            i = f;
            return k | 0;
        }
        return 0;
    }
    function rj(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0;
        d = i;
        i = (i + 16) | 0;
        e = d;
        c[e >> 2] = b;
        b = c[o >> 2] | 0;
        nd(b | 0, a | 0, e | 0) | 0;
        je(10, b | 0) | 0;
        le();
    }
    function sj() {
        var a = 0,
            b = 0;
        a = i;
        i = (i + 16) | 0;
        if (!(Cc(3984, 2) | 0)) {
            b = Jd(c[994] | 0) | 0;
            i = a;
            return b | 0;
        } else rj(3992, a);
        return 0;
    }
    function tj(a) {
        a = a | 0;
        var b = 0,
            d = 0,
            e = 0,
            f = 0;
        b = i;
        d = (a | 0) == 0 ? 1 : a;
        a = hk(d) | 0;
        if (a) {
            e = a;
            i = b;
            return e | 0;
        }
        while (1) {
            a = Cj() | 0;
            if (!a) {
                f = 4;
                break;
            }
            ng[a & 7]();
            a = hk(d) | 0;
            if (a) {
                e = a;
                f = 5;
                break;
            }
        }
        if ((f | 0) == 4) {
            d = qd(4) | 0;
            c[d >> 2] = 4168;
            Bf(d | 0, 4216, 1);
        } else if ((f | 0) == 5) {
            i = b;
            return e | 0;
        }
        return 0;
    }
    function uj(a) {
        a = a | 0;
        var b = 0,
            c = 0;
        b = i;
        c = tj(a) | 0;
        i = b;
        return c | 0;
    }
    function vj(a) {
        a = a | 0;
        var b = 0;
        b = i;
        ik(a);
        i = b;
        return;
    }
    function wj(a) {
        a = a | 0;
        var b = 0;
        b = i;
        vj(a);
        i = b;
        return;
    }
    function xj(a) {
        a = a | 0;
        var b = 0;
        b = i;
        vj(a);
        i = b;
        return;
    }
    function yj(a) {
        a = a | 0;
        return;
    }
    function zj(a) {
        a = a | 0;
        return 4184;
    }
    function Aj(a) {
        a = a | 0;
        var b = 0;
        b = i;
        i = (i + 16) | 0;
        ng[a & 7]();
        rj(4232, b);
    }
    function Bj() {
        var a = 0,
            b = 0;
        a = sj() | 0;
        if (((a | 0) != 0 ? ((b = c[a >> 2] | 0), (b | 0) != 0) : 0) ? ((a = (b + 48) | 0), ((c[a >> 2] & -256) | 0) == 1126902528 ? (c[(a + 4) >> 2] | 0) == 1129074247 : 0) : 0) Aj(c[(b + 12) >> 2] | 0);
        b = c[950] | 0;
        c[950] = b + 0;
        Aj(b);
    }
    function Cj() {
        var a = 0;
        a = c[1082] | 0;
        c[1082] = a + 0;
        return a | 0;
    }
    function Dj(a) {
        a = a | 0;
        return;
    }
    function Ej(a) {
        a = a | 0;
        return;
    }
    function Fj(a) {
        a = a | 0;
        return;
    }
    function Gj(a) {
        a = a | 0;
        var b = 0;
        b = i;
        vj(a);
        i = b;
        return;
    }
    function Hj(a) {
        a = a | 0;
        var b = 0;
        b = i;
        vj(a);
        i = b;
        return;
    }
    function Ij(a) {
        a = a | 0;
        var b = 0;
        b = i;
        vj(a);
        i = b;
        return;
    }
    function Jj(a) {
        a = a | 0;
        var b = 0;
        b = i;
        vj(a);
        i = b;
        return;
    }
    function Kj(a) {
        a = a | 0;
        var b = 0;
        b = i;
        vj(a);
        i = b;
        return;
    }
    function Lj(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        return ((a | 0) == (b | 0)) | 0;
    }
    function Mj(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        i = (i + 64) | 0;
        f = e;
        if ((a | 0) == (b | 0)) {
            g = 1;
            i = e;
            return g | 0;
        }
        if (!b) {
            g = 0;
            i = e;
            return g | 0;
        }
        h = Tj(b, 4480) | 0;
        if (!h) {
            g = 0;
            i = e;
            return g | 0;
        }
        b = (f + 0) | 0;
        j = (b + 56) | 0;
        do {
            c[b >> 2] = 0;
            b = (b + 4) | 0;
        } while ((b | 0) < (j | 0));
        c[f >> 2] = h;
        c[(f + 8) >> 2] = a;
        c[(f + 12) >> 2] = -1;
        c[(f + 48) >> 2] = 1;
        pg[c[((c[h >> 2] | 0) + 28) >> 2] & 31](h, f, c[d >> 2] | 0, 1);
        if ((c[(f + 24) >> 2] | 0) != 1) {
            g = 0;
            i = e;
            return g | 0;
        }
        c[d >> 2] = c[(f + 16) >> 2];
        g = 1;
        i = e;
        return g | 0;
    }
    function Nj(b, d, e) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0;
        f = i;
        g = (b + 16) | 0;
        h = c[g >> 2] | 0;
        if (!h) {
            c[g >> 2] = d;
            c[(b + 24) >> 2] = e;
            c[(b + 36) >> 2] = 1;
            i = f;
            return;
        }
        if ((h | 0) != (d | 0)) {
            d = (b + 36) | 0;
            c[d >> 2] = (c[d >> 2] | 0) + 1;
            c[(b + 24) >> 2] = 2;
            a[(b + 54) >> 0] = 1;
            i = f;
            return;
        }
        d = (b + 24) | 0;
        if ((c[d >> 2] | 0) != 2) {
            i = f;
            return;
        }
        c[d >> 2] = e;
        i = f;
        return;
    }
    function Oj(a, b, d, e) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0;
        f = i;
        if ((c[(b + 8) >> 2] | 0) != (a | 0)) {
            i = f;
            return;
        }
        Nj(b, d, e);
        i = f;
        return;
    }
    function Pj(a, b, d, e) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0;
        f = i;
        if ((a | 0) == (c[(b + 8) >> 2] | 0)) {
            Nj(b, d, e);
            i = f;
            return;
        } else {
            g = c[(a + 8) >> 2] | 0;
            pg[c[((c[g >> 2] | 0) + 28) >> 2] & 31](g, b, d, e);
            i = f;
            return;
        }
    }
    function Qj(a, b, d, e) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0;
        f = i;
        g = c[(a + 4) >> 2] | 0;
        h = g >> 8;
        if (!(g & 1)) j = h;
        else j = c[((c[d >> 2] | 0) + h) >> 2] | 0;
        h = c[a >> 2] | 0;
        pg[c[((c[h >> 2] | 0) + 28) >> 2] & 31](h, b, (d + j) | 0, ((g & 2) | 0) != 0 ? e : 2);
        i = f;
        return;
    }
    function Rj(b, d, e, f) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        var g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0;
        g = i;
        if ((b | 0) == (c[(d + 8) >> 2] | 0)) {
            Nj(d, e, f);
            i = g;
            return;
        }
        h = c[(b + 12) >> 2] | 0;
        j = (b + (h << 3) + 16) | 0;
        Qj((b + 16) | 0, d, e, f);
        if ((h | 0) <= 1) {
            i = g;
            return;
        }
        h = (d + 54) | 0;
        k = (b + 24) | 0;
        while (1) {
            Qj(k, d, e, f);
            if (a[h >> 0] | 0) {
                l = 7;
                break;
            }
            k = (k + 8) | 0;
            if (k >>> 0 >= j >>> 0) {
                l = 7;
                break;
            }
        }
        if ((l | 0) == 7) {
            i = g;
            return;
        }
    }
    function Sj(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        e = i;
        i = (i + 64) | 0;
        f = e;
        c[d >> 2] = c[c[d >> 2] >> 2];
        if (!(((a | 0) == (b | 0)) | ((b | 0) == 4792)))
            if (((b | 0) != 0 ? ((g = Tj(b, 4592) | 0), (g | 0) != 0) : 0) ? ((c[(g + 8) >> 2] & ~c[(a + 8) >> 2]) | 0) == 0 : 0) {
                b = c[(a + 12) >> 2] | 0;
                a = (g + 12) | 0;
                if (!((b | 0) == 4776 ? 1 : (b | 0) == (c[a >> 2] | 0)))
                    if ((((b | 0) != 0 ? ((g = Tj(b, 4480) | 0), (g | 0) != 0) : 0) ? ((b = c[a >> 2] | 0), (b | 0) != 0) : 0) ? ((a = Tj(b, 4480) | 0), (a | 0) != 0) : 0) {
                        b = (f + 0) | 0;
                        h = (b + 56) | 0;
                        do {
                            c[b >> 2] = 0;
                            b = (b + 4) | 0;
                        } while ((b | 0) < (h | 0));
                        c[f >> 2] = a;
                        c[(f + 8) >> 2] = g;
                        c[(f + 12) >> 2] = -1;
                        c[(f + 48) >> 2] = 1;
                        pg[c[((c[a >> 2] | 0) + 28) >> 2] & 31](a, f, c[d >> 2] | 0, 1);
                        if ((c[(f + 24) >> 2] | 0) == 1) {
                            c[d >> 2] = c[(f + 16) >> 2];
                            j = 1;
                        } else j = 0;
                    } else j = 0;
                else j = 1;
            } else j = 0;
        else j = 1;
        i = e;
        return j | 0;
    }
    function Tj(d, e) {
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0;
        f = i;
        i = (i + 64) | 0;
        g = f;
        h = c[d >> 2] | 0;
        j = (d + (c[(h + -8) >> 2] | 0)) | 0;
        k = c[(h + -4) >> 2] | 0;
        c[g >> 2] = e;
        c[(g + 4) >> 2] = d;
        c[(g + 8) >> 2] = 4424;
        d = (g + 12) | 0;
        h = (g + 16) | 0;
        l = (g + 20) | 0;
        m = (g + 24) | 0;
        n = (g + 28) | 0;
        o = (g + 32) | 0;
        p = (g + 40) | 0;
        q = (k | 0) == (e | 0);
        e = (d + 0) | 0;
        r = (e + 40) | 0;
        do {
            c[e >> 2] = 0;
            e = (e + 4) | 0;
        } while ((e | 0) < (r | 0));
        b[(d + 40) >> 1] = 0;
        a[(d + 42) >> 0] = 0;
        if (q) {
            c[(g + 48) >> 2] = 1;
            ag[c[((c[k >> 2] | 0) + 20) >> 2] & 7](k, g, j, j, 1, 0);
            s = (c[m >> 2] | 0) == 1 ? j : 0;
            i = f;
            return s | 0;
        }
        Sf[c[((c[k >> 2] | 0) + 24) >> 2] & 7](k, g, j, 1, 0);
        j = c[(g + 36) >> 2] | 0;
        if (!j) {
            s = ((c[p >> 2] | 0) == 1) & ((c[n >> 2] | 0) == 1) & ((c[o >> 2] | 0) == 1) ? c[l >> 2] | 0 : 0;
            i = f;
            return s | 0;
        } else if ((j | 0) == 1) {
            if ((c[m >> 2] | 0) != 1 ? !(((c[p >> 2] | 0) == 0) & ((c[n >> 2] | 0) == 1) & ((c[o >> 2] | 0) == 1)) : 0) {
                s = 0;
                i = f;
                return s | 0;
            }
            s = c[h >> 2] | 0;
            i = f;
            return s | 0;
        } else {
            s = 0;
            i = f;
            return s | 0;
        }
        return 0;
    }
    function Uj(b, d, e, f) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        var g = 0,
            h = 0,
            j = 0;
        g = i;
        a[(b + 53) >> 0] = 1;
        if ((c[(b + 4) >> 2] | 0) != (e | 0)) {
            i = g;
            return;
        }
        a[(b + 52) >> 0] = 1;
        e = (b + 16) | 0;
        h = c[e >> 2] | 0;
        if (!h) {
            c[e >> 2] = d;
            c[(b + 24) >> 2] = f;
            c[(b + 36) >> 2] = 1;
            if (!((f | 0) == 1 ? (c[(b + 48) >> 2] | 0) == 1 : 0)) {
                i = g;
                return;
            }
            a[(b + 54) >> 0] = 1;
            i = g;
            return;
        }
        if ((h | 0) != (d | 0)) {
            d = (b + 36) | 0;
            c[d >> 2] = (c[d >> 2] | 0) + 1;
            a[(b + 54) >> 0] = 1;
            i = g;
            return;
        }
        d = (b + 24) | 0;
        h = c[d >> 2] | 0;
        if ((h | 0) == 2) {
            c[d >> 2] = f;
            j = f;
        } else j = h;
        if (!((j | 0) == 1 ? (c[(b + 48) >> 2] | 0) == 1 : 0)) {
            i = g;
            return;
        }
        a[(b + 54) >> 0] = 1;
        i = g;
        return;
    }
    function Vj(b, d, e, f, g) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        var h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0;
        h = i;
        if ((b | 0) == (c[(d + 8) >> 2] | 0)) {
            if ((c[(d + 4) >> 2] | 0) != (e | 0)) {
                i = h;
                return;
            }
            j = (d + 28) | 0;
            if ((c[j >> 2] | 0) == 1) {
                i = h;
                return;
            }
            c[j >> 2] = f;
            i = h;
            return;
        }
        if ((b | 0) != (c[d >> 2] | 0)) {
            j = c[(b + 12) >> 2] | 0;
            k = (b + (j << 3) + 16) | 0;
            Xj((b + 16) | 0, d, e, f, g);
            l = (b + 24) | 0;
            if ((j | 0) <= 1) {
                i = h;
                return;
            }
            j = c[(b + 8) >> 2] | 0;
            if (((j & 2) | 0) == 0 ? ((m = (d + 36) | 0), (c[m >> 2] | 0) != 1) : 0) {
                if (!(j & 1)) {
                    j = (d + 54) | 0;
                    n = l;
                    while (1) {
                        if (a[j >> 0] | 0) {
                            o = 43;
                            break;
                        }
                        if ((c[m >> 2] | 0) == 1) {
                            o = 43;
                            break;
                        }
                        Xj(n, d, e, f, g);
                        n = (n + 8) | 0;
                        if (n >>> 0 >= k >>> 0) {
                            o = 43;
                            break;
                        }
                    }
                    if ((o | 0) == 43) {
                        i = h;
                        return;
                    }
                }
                n = (d + 24) | 0;
                j = (d + 54) | 0;
                p = l;
                while (1) {
                    if (a[j >> 0] | 0) {
                        o = 43;
                        break;
                    }
                    if ((c[m >> 2] | 0) == 1 ? (c[n >> 2] | 0) == 1 : 0) {
                        o = 43;
                        break;
                    }
                    Xj(p, d, e, f, g);
                    p = (p + 8) | 0;
                    if (p >>> 0 >= k >>> 0) {
                        o = 43;
                        break;
                    }
                }
                if ((o | 0) == 43) {
                    i = h;
                    return;
                }
            }
            p = (d + 54) | 0;
            n = l;
            while (1) {
                if (a[p >> 0] | 0) {
                    o = 43;
                    break;
                }
                Xj(n, d, e, f, g);
                n = (n + 8) | 0;
                if (n >>> 0 >= k >>> 0) {
                    o = 43;
                    break;
                }
            }
            if ((o | 0) == 43) {
                i = h;
                return;
            }
        }
        if ((c[(d + 16) >> 2] | 0) != (e | 0) ? ((k = (d + 20) | 0), (c[k >> 2] | 0) != (e | 0)) : 0) {
            c[(d + 32) >> 2] = f;
            n = (d + 44) | 0;
            if ((c[n >> 2] | 0) == 4) {
                i = h;
                return;
            }
            p = c[(b + 12) >> 2] | 0;
            l = (b + (p << 3) + 16) | 0;
            a: do
                if ((p | 0) > 0) {
                    m = (d + 52) | 0;
                    j = (d + 53) | 0;
                    q = (d + 54) | 0;
                    r = (b + 8) | 0;
                    s = (d + 24) | 0;
                    t = 0;
                    u = 0;
                    v = (b + 16) | 0;
                    b: while (1) {
                        a[m >> 0] = 0;
                        a[j >> 0] = 0;
                        Wj(v, d, e, e, 1, g);
                        if (a[q >> 0] | 0) {
                            w = t;
                            x = u;
                            break;
                        }
                        do
                            if (a[j >> 0] | 0) {
                                if (!(a[m >> 0] | 0))
                                    if (!(c[r >> 2] & 1)) {
                                        w = t;
                                        x = 1;
                                        break b;
                                    } else {
                                        y = t;
                                        z = 1;
                                        break;
                                    }
                                if ((c[s >> 2] | 0) == 1) {
                                    o = 25;
                                    break a;
                                }
                                if (!(c[r >> 2] & 2)) {
                                    o = 25;
                                    break a;
                                } else {
                                    y = 1;
                                    z = 1;
                                }
                            } else {
                                y = t;
                                z = u;
                            }
                        while (0);
                        v = (v + 8) | 0;
                        if (v >>> 0 >= l >>> 0) {
                            w = y;
                            x = z;
                            break;
                        } else {
                            t = y;
                            u = z;
                        }
                    }
                    if (w) {
                        A = x;
                        o = 24;
                    } else {
                        B = x;
                        o = 21;
                    }
                } else {
                    B = 0;
                    o = 21;
                }
            while (0);
            if ((o | 0) == 21) {
                c[k >> 2] = e;
                e = (d + 40) | 0;
                c[e >> 2] = (c[e >> 2] | 0) + 1;
                if ((c[(d + 36) >> 2] | 0) == 1 ? (c[(d + 24) >> 2] | 0) == 2 : 0) {
                    a[(d + 54) >> 0] = 1;
                    if (B) o = 25;
                    else o = 26;
                } else {
                    A = B;
                    o = 24;
                }
            }
            if ((o | 0) == 24)
                if (A) o = 25;
                else o = 26;
            if ((o | 0) == 25) {
                c[n >> 2] = 3;
                i = h;
                return;
            } else if ((o | 0) == 26) {
                c[n >> 2] = 4;
                i = h;
                return;
            }
        }
        if ((f | 0) != 1) {
            i = h;
            return;
        }
        c[(d + 32) >> 2] = 1;
        i = h;
        return;
    }
    function Wj(a, b, d, e, f, g) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        var h = 0,
            j = 0,
            k = 0,
            l = 0;
        h = i;
        j = c[(a + 4) >> 2] | 0;
        k = j >> 8;
        if (!(j & 1)) l = k;
        else l = c[((c[e >> 2] | 0) + k) >> 2] | 0;
        k = c[a >> 2] | 0;
        ag[c[((c[k >> 2] | 0) + 20) >> 2] & 7](k, b, d, (e + l) | 0, ((j & 2) | 0) != 0 ? f : 2, g);
        i = h;
        return;
    }
    function Xj(a, b, d, e, f) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        var g = 0,
            h = 0,
            j = 0,
            k = 0;
        g = i;
        h = c[(a + 4) >> 2] | 0;
        j = h >> 8;
        if (!(h & 1)) k = j;
        else k = c[((c[d >> 2] | 0) + j) >> 2] | 0;
        j = c[a >> 2] | 0;
        Sf[c[((c[j >> 2] | 0) + 24) >> 2] & 7](j, b, (d + k) | 0, ((h & 2) | 0) != 0 ? e : 2, f);
        i = g;
        return;
    }
    function Yj(b, d, e, f, g) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        var h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0;
        h = i;
        if ((b | 0) == (c[(d + 8) >> 2] | 0)) {
            if ((c[(d + 4) >> 2] | 0) != (e | 0)) {
                i = h;
                return;
            }
            j = (d + 28) | 0;
            if ((c[j >> 2] | 0) == 1) {
                i = h;
                return;
            }
            c[j >> 2] = f;
            i = h;
            return;
        }
        if ((b | 0) != (c[d >> 2] | 0)) {
            j = c[(b + 8) >> 2] | 0;
            Sf[c[((c[j >> 2] | 0) + 24) >> 2] & 7](j, d, e, f, g);
            i = h;
            return;
        }
        if ((c[(d + 16) >> 2] | 0) != (e | 0) ? ((j = (d + 20) | 0), (c[j >> 2] | 0) != (e | 0)) : 0) {
            c[(d + 32) >> 2] = f;
            k = (d + 44) | 0;
            if ((c[k >> 2] | 0) == 4) {
                i = h;
                return;
            }
            l = (d + 52) | 0;
            a[l >> 0] = 0;
            m = (d + 53) | 0;
            a[m >> 0] = 0;
            n = c[(b + 8) >> 2] | 0;
            ag[c[((c[n >> 2] | 0) + 20) >> 2] & 7](n, d, e, e, 1, g);
            if (a[m >> 0] | 0) {
                if (!(a[l >> 0] | 0)) {
                    o = 1;
                    p = 13;
                }
            } else {
                o = 0;
                p = 13;
            }
            do
                if ((p | 0) == 13) {
                    c[j >> 2] = e;
                    l = (d + 40) | 0;
                    c[l >> 2] = (c[l >> 2] | 0) + 1;
                    if ((c[(d + 36) >> 2] | 0) == 1 ? (c[(d + 24) >> 2] | 0) == 2 : 0) {
                        a[(d + 54) >> 0] = 1;
                        if (o) break;
                    } else p = 16;
                    if ((p | 0) == 16 ? o : 0) break;
                    c[k >> 2] = 4;
                    i = h;
                    return;
                }
            while (0);
            c[k >> 2] = 3;
            i = h;
            return;
        }
        if ((f | 0) != 1) {
            i = h;
            return;
        }
        c[(d + 32) >> 2] = 1;
        i = h;
        return;
    }
    function Zj(b, d, e, f, g) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        var h = 0;
        g = i;
        if ((c[(d + 8) >> 2] | 0) == (b | 0)) {
            if ((c[(d + 4) >> 2] | 0) != (e | 0)) {
                i = g;
                return;
            }
            h = (d + 28) | 0;
            if ((c[h >> 2] | 0) == 1) {
                i = g;
                return;
            }
            c[h >> 2] = f;
            i = g;
            return;
        }
        if ((c[d >> 2] | 0) != (b | 0)) {
            i = g;
            return;
        }
        if ((c[(d + 16) >> 2] | 0) != (e | 0) ? ((b = (d + 20) | 0), (c[b >> 2] | 0) != (e | 0)) : 0) {
            c[(d + 32) >> 2] = f;
            c[b >> 2] = e;
            e = (d + 40) | 0;
            c[e >> 2] = (c[e >> 2] | 0) + 1;
            if ((c[(d + 36) >> 2] | 0) == 1 ? (c[(d + 24) >> 2] | 0) == 2 : 0) a[(d + 54) >> 0] = 1;
            c[(d + 44) >> 2] = 4;
            i = g;
            return;
        }
        if ((f | 0) != 1) {
            i = g;
            return;
        }
        c[(d + 32) >> 2] = 1;
        i = g;
        return;
    }
    function _j(b, d, e, f, g, h) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        var j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0;
        j = i;
        if ((b | 0) == (c[(d + 8) >> 2] | 0)) {
            Uj(d, e, f, g);
            i = j;
            return;
        }
        k = (d + 52) | 0;
        l = a[k >> 0] | 0;
        m = (d + 53) | 0;
        n = a[m >> 0] | 0;
        o = c[(b + 12) >> 2] | 0;
        p = (b + (o << 3) + 16) | 0;
        a[k >> 0] = 0;
        a[m >> 0] = 0;
        Wj((b + 16) | 0, d, e, f, g, h);
        a: do
            if ((o | 0) > 1) {
                q = (d + 24) | 0;
                r = (b + 8) | 0;
                s = (d + 54) | 0;
                t = (b + 24) | 0;
                do {
                    if (a[s >> 0] | 0) break a;
                    if (!(a[k >> 0] | 0)) {
                        if ((a[m >> 0] | 0) != 0 ? ((c[r >> 2] & 1) | 0) == 0 : 0) break a;
                    } else {
                        if ((c[q >> 2] | 0) == 1) break a;
                        if (!(c[r >> 2] & 2)) break a;
                    }
                    a[k >> 0] = 0;
                    a[m >> 0] = 0;
                    Wj(t, d, e, f, g, h);
                    t = (t + 8) | 0;
                } while (t >>> 0 < p >>> 0);
            }
        while (0);
        a[k >> 0] = l;
        a[m >> 0] = n;
        i = j;
        return;
    }
    function $j(a, b, d, e, f, g) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        var h = 0,
            j = 0;
        h = i;
        if ((a | 0) == (c[(b + 8) >> 2] | 0)) {
            Uj(b, d, e, f);
            i = h;
            return;
        } else {
            j = c[(a + 8) >> 2] | 0;
            ag[c[((c[j >> 2] | 0) + 20) >> 2] & 7](j, b, d, e, f, g);
            i = h;
            return;
        }
    }
    function ak(a, b, d, e, f, g) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        g = i;
        if ((c[(b + 8) >> 2] | 0) != (a | 0)) {
            i = g;
            return;
        }
        Uj(b, d, e, f);
        i = g;
        return;
    }
    function bk(a, b, d) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0;
        e = i;
        i = (i + 16) | 0;
        f = e;
        c[f >> 2] = c[d >> 2];
        g = _f[c[((c[a >> 2] | 0) + 16) >> 2] & 7](a, b, f) | 0;
        b = g & 1;
        if (!g) {
            i = e;
            return b | 0;
        }
        c[d >> 2] = c[f >> 2];
        i = e;
        return b | 0;
    }
    function ck(a) {
        a = a | 0;
        var b = 0,
            c = 0;
        b = i;
        if (!a) c = 0;
        else c = (Tj(a, 4592) | 0) != 0;
        i = b;
        return (c & 1) | 0;
    }
    function dk() {
        var a = 0,
            b = 0,
            d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0;
        a = i;
        i = (i + 16) | 0;
        b = a;
        d = (a + 12) | 0;
        a = sj() | 0;
        if (!a) rj(3960, b);
        e = c[a >> 2] | 0;
        if (!e) rj(3960, b);
        a = (e + 48) | 0;
        f = c[a >> 2] | 0;
        g = c[(a + 4) >> 2] | 0;
        if (!((((f & -256) | 0) == 1126902528) & ((g | 0) == 1129074247))) {
            c[b >> 2] = 3808;
            rj(3920, b);
        }
        if (((f | 0) == 1126902529) & ((g | 0) == 1129074247)) h = c[(e + 44) >> 2] | 0;
        else h = (e + 80) | 0;
        c[d >> 2] = h;
        h = c[e >> 2] | 0;
        e = c[(h + 4) >> 2] | 0;
        if (Mj(4352, h, d) | 0) {
            h = c[d >> 2] | 0;
            d = Xf[c[((c[h >> 2] | 0) + 8) >> 2] & 63](h) | 0;
            c[b >> 2] = 3808;
            c[(b + 4) >> 2] = e;
            c[(b + 8) >> 2] = d;
            rj(3824, b);
        } else {
            c[b >> 2] = 3808;
            c[(b + 4) >> 2] = e;
            rj(3872, b);
        }
    }
    function ek() {
        var a = 0;
        a = i;
        i = (i + 16) | 0;
        if (!(Xd(3976, 26) | 0)) {
            i = a;
            return;
        } else rj(4048, a);
    }
    function fk(a) {
        a = a | 0;
        var b = 0;
        b = i;
        i = (i + 16) | 0;
        ik(a);
        if (!(zd(c[994] | 0, 0) | 0)) {
            i = b;
            return;
        } else rj(4104, b);
    }
    function gk(b) {
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        d = i;
        i = (i + 16) | 0;
        e = d;
        f = hk(((xk(b | 0) | 0) + 1) | 0) | 0;
        uk(f | 0, b | 0) | 0;
        g = qj(f, 5208) | 0;
        if (g) a[g >> 0] = 0;
        g = qj(f, 5216) | 0;
        if (g) a[g >> 0] = 0;
        g = qj(f, 5224) | 0;
        if (g) a[g >> 0] = 0;
        if (ok(f, 5232) | 0)
            if (ok(f, 5272) | 0)
                if (ok(f, 5312) | 0)
                    if (!(ok(f, 5352) | 0)) h = 5368;
                    else {
                        g = (ok(f, 5384) | 0) == 0;
                        h = g ? 5400 : f;
                    }
                else h = 5336;
            else h = 5296;
        else h = 5256;
        do
            if (ok(h, 5416) | 0)
                if (ok(h, 5432) | 0)
                    if (ok(h, 5448) | 0)
                        if (ok(h, 5464) | 0)
                            if (ok(h, 5480) | 0)
                                if (ok(h, 5496) | 0)
                                    if (ok(h, 5512) | 0)
                                        if ((ok(h, 5536) | 0) != 0 ? (ok(h, 5560) | 0) != 0 : 0)
                                            if (ok(h, 5592) | 0)
                                                if (ok(h, 5608) | 0)
                                                    if (ok(h, 5624) | 0)
                                                        if (ok(h, 5640) | 0)
                                                            if (ok(h, 5656) | 0)
                                                                if (!(ok(h, 5680) | 0)) j = 10;
                                                                else {
                                                                    if (!(ok(h, 5704) | 0)) {
                                                                        j = 11;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5728) | 0)) {
                                                                        j = 12;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5752) | 0)) {
                                                                        j = 25;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5768) | 0)) {
                                                                        j = 17;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5784) | 0)) {
                                                                        j = 18;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5800) | 0)) {
                                                                        j = 13;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5824) | 0)) {
                                                                        j = 4;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5840) | 0)) {
                                                                        j = 5;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5856) | 0)) {
                                                                        j = 26;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5872) | 0)) {
                                                                        j = 19;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5896) | 0)) {
                                                                        j = 20;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5920) | 0)) {
                                                                        j = 21;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5944) | 0)) {
                                                                        j = 14;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5976) | 0)) {
                                                                        j = 27;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6e3) | 0)) {
                                                                        j = 15;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6016) | 0)) {
                                                                        j = 16;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6032) | 0)) {
                                                                        j = 20;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6056) | 0)) {
                                                                        j = 17;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6080) | 0)) {
                                                                        j = 18;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6104) | 0)) {
                                                                        j = 19;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6136) | 0)) {
                                                                        j = 2;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6160) | 0)) {
                                                                        j = 1;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6176) | 0)) {
                                                                        j = 1;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6192) | 0)) {
                                                                        j = 1;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6208) | 0)) {
                                                                        j = 1;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6224) | 0)) {
                                                                        j = 22;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6240) | 0)) {
                                                                        j = 20;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6256) | 0)) {
                                                                        j = 6;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6272) | 0)) {
                                                                        j = 4;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6288) | 0)) {
                                                                        j = 21;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6304) | 0)) {
                                                                        j = 22;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6320) | 0)) {
                                                                        j = 23;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6336) | 0)) {
                                                                        j = 24;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6352) | 0)) {
                                                                        j = 25;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6368) | 0)) {
                                                                        j = 26;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6384) | 0)) {
                                                                        j = 27;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6400) | 0)) {
                                                                        j = 28;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6416) | 0)) {
                                                                        j = 7;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6440) | 0)) {
                                                                        j = 8;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6464) | 0)) {
                                                                        j = 9;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6488) | 0)) {
                                                                        j = 23;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6504) | 0)) {
                                                                        j = 24;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6528) | 0)) {
                                                                        j = 25;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6552) | 0)) {
                                                                        j = 26;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6576) | 0)) {
                                                                        j = 27;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6600) | 0)) {
                                                                        j = 21;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6624) | 0)) {
                                                                        j = 3;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5336) | 0)) {
                                                                        j = 28;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6648) | 0)) {
                                                                        j = 27;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6664) | 0)) {
                                                                        j = 10;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6688) | 0)) {
                                                                        j = 11;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6704) | 0)) {
                                                                        j = 12;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6728) | 0)) {
                                                                        j = 28;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6744) | 0)) {
                                                                        j = 13;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6768) | 0)) {
                                                                        j = 29;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6784) | 0)) {
                                                                        j = 30;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6800) | 0)) {
                                                                        j = 29;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5256) | 0)) {
                                                                        j = 6;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6816) | 0)) {
                                                                        j = 29;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5368) | 0)) {
                                                                        j = 28;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5400) | 0)) {
                                                                        j = 29;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6832) | 0)) {
                                                                        j = 14;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6864) | 0)) {
                                                                        j = 30;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6880) | 0)) {
                                                                        j = 15;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 5296) | 0)) {
                                                                        j = 31;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6904) | 0)) {
                                                                        j = 32;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6928) | 0)) {
                                                                        j = 30;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6944) | 0)) {
                                                                        j = 31;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6968) | 0)) {
                                                                        j = 30;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 6992) | 0)) {
                                                                        j = 31;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7016) | 0)) {
                                                                        j = 32;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7040) | 0)) {
                                                                        j = 16;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7072) | 0)) {
                                                                        j = 5;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7096) | 0)) {
                                                                        j = 17;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7136) | 0)) {
                                                                        j = 31;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7152) | 0)) {
                                                                        j = 33;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7168) | 0)) {
                                                                        j = 32;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7192) | 0)) {
                                                                        j = 18;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7208) | 0)) {
                                                                        j = 33;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7224) | 0)) {
                                                                        j = 34;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7240) | 0)) {
                                                                        j = 4;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7264) | 0)) {
                                                                        j = 34;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7288) | 0)) {
                                                                        j = 19;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7304) | 0)) {
                                                                        j = 20;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7328) | 0)) {
                                                                        j = 33;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7344) | 0)) {
                                                                        j = 21;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7360) | 0)) {
                                                                        j = 35;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7384) | 0)) {
                                                                        j = 35;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7408) | 0)) {
                                                                        j = 36;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7432) | 0)) {
                                                                        j = 36;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7456) | 0)) {
                                                                        j = 37;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7472) | 0)) {
                                                                        j = 3;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7488) | 0)) {
                                                                        j = 38;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7504) | 0)) {
                                                                        j = 1;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7520) | 0)) {
                                                                        j = 1;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7536) | 0)) {
                                                                        j = 5;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7560) | 0)) {
                                                                        j = 39;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7592) | 0)) {
                                                                        j = 40;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7624) | 0)) {
                                                                        j = 34;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7640) | 0)) {
                                                                        j = 22;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7656) | 0)) {
                                                                        j = 6;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7672) | 0)) {
                                                                        j = 4;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7696) | 0)) {
                                                                        j = 7;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7712) | 0)) {
                                                                        j = 37;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7736) | 0)) {
                                                                        j = 23;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7760) | 0)) {
                                                                        j = 7;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7784) | 0)) {
                                                                        j = 5;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7800) | 0)) {
                                                                        j = 6;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7808) | 0)) {
                                                                        j = 1;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7824) | 0)) {
                                                                        j = 2;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7840) | 0)) {
                                                                        j = 41;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7856) | 0)) {
                                                                        j = 42;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7872) | 0)) {
                                                                        j = 43;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7888) | 0)) {
                                                                        j = 44;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7904) | 0)) {
                                                                        j = 45;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7920) | 0)) {
                                                                        j = 46;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7928) | 0)) {
                                                                        j = 3;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7944) | 0)) {
                                                                        j = 47;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7960) | 0)) {
                                                                        j = 48;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7976) | 0)) {
                                                                        j = 49;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 7992) | 0)) {
                                                                        j = 32;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8024) | 0)) {
                                                                        j = 50;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8048) | 0)) {
                                                                        j = 51;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8064) | 0)) {
                                                                        j = 52;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8080) | 0)) {
                                                                        j = 33;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8096) | 0)) {
                                                                        j = 38;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8112) | 0)) {
                                                                        j = 39;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8136) | 0)) {
                                                                        j = 1;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8152) | 0)) {
                                                                        j = 2;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8168) | 0)) {
                                                                        j = 40;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8192) | 0)) {
                                                                        j = 41;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8200) | 0)) {
                                                                        j = 3;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8216) | 0)) {
                                                                        j = 2;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8240) | 0)) {
                                                                        j = 1;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8264) | 0)) {
                                                                        j = 35;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8280) | 0)) {
                                                                        j = 3;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8296) | 0)) {
                                                                        j = 2;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8320) | 0)) {
                                                                        j = 36;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8336) | 0)) {
                                                                        j = 37;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8352) | 0)) {
                                                                        j = 24;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8368) | 0)) {
                                                                        j = 2;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8384) | 0)) {
                                                                        j = 25;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8400) | 0)) {
                                                                        j = 2;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8424) | 0)) {
                                                                        j = 26;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8440) | 0)) {
                                                                        j = 27;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8464) | 0)) {
                                                                        j = 28;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8488) | 0)) {
                                                                        j = 3;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8504) | 0)) {
                                                                        j = 29;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8528) | 0)) {
                                                                        j = 30;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8552) | 0)) {
                                                                        j = 2;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8576) | 0)) {
                                                                        j = 2;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8600) | 0)) {
                                                                        j = 3;
                                                                        break;
                                                                    }
                                                                    if (!(ok(h, 8624) | 0)) {
                                                                        j = 42;
                                                                        break;
                                                                    }
                                                                    f = c[o >> 2] | 0;
                                                                    c[e >> 2] = b;
                                                                    c[(e + 4) >> 2] = h;
                                                                    $c(f | 0, 8640, e | 0) | 0;
                                                                    j = 0;
                                                                }
                                                            else j = 9;
                                                        else j = 16;
                                                    else j = 1;
                                                else j = 3;
                                            else j = 2;
                                        else j = 1;
                                    else j = 15;
                                else j = 14;
                            else j = 13;
                        else j = 12;
                    else j = 11;
                else j = 24;
            else j = 10;
        while (0);
        i = d;
        return j | 0;
    }
    function hk(a) {
        a = a | 0;
        var b = 0,
            d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0,
            C = 0,
            D = 0,
            E = 0,
            F = 0,
            G = 0,
            H = 0,
            I = 0,
            J = 0,
            K = 0,
            L = 0,
            M = 0,
            N = 0,
            O = 0,
            P = 0,
            Q = 0,
            R = 0,
            S = 0,
            T = 0,
            U = 0,
            V = 0,
            W = 0,
            X = 0,
            Y = 0,
            Z = 0,
            _ = 0,
            $ = 0,
            aa = 0,
            ba = 0,
            ca = 0,
            da = 0,
            ea = 0,
            fa = 0,
            ga = 0,
            ha = 0,
            ia = 0,
            ja = 0,
            ka = 0,
            la = 0,
            ma = 0,
            na = 0,
            oa = 0,
            pa = 0,
            qa = 0,
            ra = 0,
            sa = 0,
            ta = 0,
            ua = 0,
            va = 0,
            wa = 0,
            xa = 0,
            ya = 0,
            za = 0,
            Aa = 0,
            Ba = 0,
            Ca = 0,
            Da = 0,
            Ea = 0,
            Fa = 0,
            Ga = 0,
            Ha = 0,
            Ia = 0,
            Ja = 0,
            Ka = 0,
            La = 0;
        b = i;
        do
            if (a >>> 0 < 245) {
                if (a >>> 0 < 11) d = 16;
                else d = (a + 11) & -8;
                e = d >>> 3;
                f = c[2170] | 0;
                g = f >>> e;
                if (g & 3) {
                    h = (((g & 1) ^ 1) + e) | 0;
                    j = h << 1;
                    k = (8720 + (j << 2)) | 0;
                    l = (8720 + ((j + 2) << 2)) | 0;
                    j = c[l >> 2] | 0;
                    m = (j + 8) | 0;
                    n = c[m >> 2] | 0;
                    do
                        if ((k | 0) != (n | 0)) {
                            if (n >>> 0 < (c[2174] | 0) >>> 0) le();
                            o = (n + 12) | 0;
                            if ((c[o >> 2] | 0) == (j | 0)) {
                                c[o >> 2] = k;
                                c[l >> 2] = n;
                                break;
                            } else le();
                        } else c[2170] = f & ~(1 << h);
                    while (0);
                    n = h << 3;
                    c[(j + 4) >> 2] = n | 3;
                    l = (j + (n | 4)) | 0;
                    c[l >> 2] = c[l >> 2] | 1;
                    p = m;
                    i = b;
                    return p | 0;
                }
                l = c[2172] | 0;
                if (d >>> 0 > l >>> 0) {
                    if (g) {
                        n = 2 << e;
                        k = (g << e) & (n | (0 - n));
                        n = ((k & (0 - k)) + -1) | 0;
                        k = (n >>> 12) & 16;
                        o = n >>> k;
                        n = (o >>> 5) & 8;
                        q = o >>> n;
                        o = (q >>> 2) & 4;
                        r = q >>> o;
                        q = (r >>> 1) & 2;
                        s = r >>> q;
                        r = (s >>> 1) & 1;
                        t = ((n | k | o | q | r) + (s >>> r)) | 0;
                        r = t << 1;
                        s = (8720 + (r << 2)) | 0;
                        q = (8720 + ((r + 2) << 2)) | 0;
                        r = c[q >> 2] | 0;
                        o = (r + 8) | 0;
                        k = c[o >> 2] | 0;
                        do
                            if ((s | 0) != (k | 0)) {
                                if (k >>> 0 < (c[2174] | 0) >>> 0) le();
                                n = (k + 12) | 0;
                                if ((c[n >> 2] | 0) == (r | 0)) {
                                    c[n >> 2] = s;
                                    c[q >> 2] = k;
                                    u = c[2172] | 0;
                                    break;
                                } else le();
                            } else {
                                c[2170] = f & ~(1 << t);
                                u = l;
                            }
                        while (0);
                        l = t << 3;
                        f = (l - d) | 0;
                        c[(r + 4) >> 2] = d | 3;
                        k = (r + d) | 0;
                        c[(r + (d | 4)) >> 2] = f | 1;
                        c[(r + l) >> 2] = f;
                        if (u) {
                            l = c[2175] | 0;
                            q = u >>> 3;
                            s = q << 1;
                            e = (8720 + (s << 2)) | 0;
                            g = c[2170] | 0;
                            m = 1 << q;
                            if (g & m) {
                                q = (8720 + ((s + 2) << 2)) | 0;
                                j = c[q >> 2] | 0;
                                if (j >>> 0 < (c[2174] | 0) >>> 0) le();
                                else {
                                    v = q;
                                    w = j;
                                }
                            } else {
                                c[2170] = g | m;
                                v = (8720 + ((s + 2) << 2)) | 0;
                                w = e;
                            }
                            c[v >> 2] = l;
                            c[(w + 12) >> 2] = l;
                            c[(l + 8) >> 2] = w;
                            c[(l + 12) >> 2] = e;
                        }
                        c[2172] = f;
                        c[2175] = k;
                        p = o;
                        i = b;
                        return p | 0;
                    }
                    k = c[2171] | 0;
                    if (k) {
                        f = ((k & (0 - k)) + -1) | 0;
                        k = (f >>> 12) & 16;
                        e = f >>> k;
                        f = (e >>> 5) & 8;
                        l = e >>> f;
                        e = (l >>> 2) & 4;
                        s = l >>> e;
                        l = (s >>> 1) & 2;
                        m = s >>> l;
                        s = (m >>> 1) & 1;
                        g = c[(8984 + (((f | k | e | l | s) + (m >>> s)) << 2)) >> 2] | 0;
                        s = ((c[(g + 4) >> 2] & -8) - d) | 0;
                        m = g;
                        l = g;
                        while (1) {
                            g = c[(m + 16) >> 2] | 0;
                            if (!g) {
                                e = c[(m + 20) >> 2] | 0;
                                if (!e) break;
                                else x = e;
                            } else x = g;
                            g = ((c[(x + 4) >> 2] & -8) - d) | 0;
                            e = g >>> 0 < s >>> 0;
                            s = e ? g : s;
                            m = x;
                            l = e ? x : l;
                        }
                        m = c[2174] | 0;
                        if (l >>> 0 < m >>> 0) le();
                        o = (l + d) | 0;
                        if (l >>> 0 >= o >>> 0) le();
                        r = c[(l + 24) >> 2] | 0;
                        t = c[(l + 12) >> 2] | 0;
                        do
                            if ((t | 0) == (l | 0)) {
                                e = (l + 20) | 0;
                                g = c[e >> 2] | 0;
                                if (!g) {
                                    k = (l + 16) | 0;
                                    f = c[k >> 2] | 0;
                                    if (!f) {
                                        y = 0;
                                        break;
                                    } else {
                                        z = f;
                                        A = k;
                                    }
                                } else {
                                    z = g;
                                    A = e;
                                }
                                while (1) {
                                    e = (z + 20) | 0;
                                    g = c[e >> 2] | 0;
                                    if (g) {
                                        z = g;
                                        A = e;
                                        continue;
                                    }
                                    e = (z + 16) | 0;
                                    g = c[e >> 2] | 0;
                                    if (!g) break;
                                    else {
                                        z = g;
                                        A = e;
                                    }
                                }
                                if (A >>> 0 < m >>> 0) le();
                                else {
                                    c[A >> 2] = 0;
                                    y = z;
                                    break;
                                }
                            } else {
                                e = c[(l + 8) >> 2] | 0;
                                if (e >>> 0 < m >>> 0) le();
                                g = (e + 12) | 0;
                                if ((c[g >> 2] | 0) != (l | 0)) le();
                                k = (t + 8) | 0;
                                if ((c[k >> 2] | 0) == (l | 0)) {
                                    c[g >> 2] = t;
                                    c[k >> 2] = e;
                                    y = t;
                                    break;
                                } else le();
                            }
                        while (0);
                        do
                            if (r) {
                                t = c[(l + 28) >> 2] | 0;
                                m = (8984 + (t << 2)) | 0;
                                if ((l | 0) == (c[m >> 2] | 0)) {
                                    c[m >> 2] = y;
                                    if (!y) {
                                        c[2171] = c[2171] & ~(1 << t);
                                        break;
                                    }
                                } else {
                                    if (r >>> 0 < (c[2174] | 0) >>> 0) le();
                                    t = (r + 16) | 0;
                                    if ((c[t >> 2] | 0) == (l | 0)) c[t >> 2] = y;
                                    else c[(r + 20) >> 2] = y;
                                    if (!y) break;
                                }
                                t = c[2174] | 0;
                                if (y >>> 0 < t >>> 0) le();
                                c[(y + 24) >> 2] = r;
                                m = c[(l + 16) >> 2] | 0;
                                do
                                    if (m)
                                        if (m >>> 0 < t >>> 0) le();
                                        else {
                                            c[(y + 16) >> 2] = m;
                                            c[(m + 24) >> 2] = y;
                                            break;
                                        }
                                while (0);
                                m = c[(l + 20) >> 2] | 0;
                                if (m)
                                    if (m >>> 0 < (c[2174] | 0) >>> 0) le();
                                    else {
                                        c[(y + 20) >> 2] = m;
                                        c[(m + 24) >> 2] = y;
                                        break;
                                    }
                            }
                        while (0);
                        if (s >>> 0 < 16) {
                            r = (s + d) | 0;
                            c[(l + 4) >> 2] = r | 3;
                            m = (l + (r + 4)) | 0;
                            c[m >> 2] = c[m >> 2] | 1;
                        } else {
                            c[(l + 4) >> 2] = d | 3;
                            c[(l + (d | 4)) >> 2] = s | 1;
                            c[(l + (s + d)) >> 2] = s;
                            m = c[2172] | 0;
                            if (m) {
                                r = c[2175] | 0;
                                t = m >>> 3;
                                m = t << 1;
                                e = (8720 + (m << 2)) | 0;
                                k = c[2170] | 0;
                                g = 1 << t;
                                if (k & g) {
                                    t = (8720 + ((m + 2) << 2)) | 0;
                                    f = c[t >> 2] | 0;
                                    if (f >>> 0 < (c[2174] | 0) >>> 0) le();
                                    else {
                                        B = t;
                                        C = f;
                                    }
                                } else {
                                    c[2170] = k | g;
                                    B = (8720 + ((m + 2) << 2)) | 0;
                                    C = e;
                                }
                                c[B >> 2] = r;
                                c[(C + 12) >> 2] = r;
                                c[(r + 8) >> 2] = C;
                                c[(r + 12) >> 2] = e;
                            }
                            c[2172] = s;
                            c[2175] = o;
                        }
                        p = (l + 8) | 0;
                        i = b;
                        return p | 0;
                    } else D = d;
                } else D = d;
            } else if (a >>> 0 <= 4294967231) {
                e = (a + 11) | 0;
                r = e & -8;
                m = c[2171] | 0;
                if (m) {
                    g = (0 - r) | 0;
                    k = e >>> 8;
                    if (k)
                        if (r >>> 0 > 16777215) E = 31;
                        else {
                            e = (((k + 1048320) | 0) >>> 16) & 8;
                            f = k << e;
                            k = (((f + 520192) | 0) >>> 16) & 4;
                            t = f << k;
                            f = (((t + 245760) | 0) >>> 16) & 2;
                            j = (14 - (k | e | f) + ((t << f) >>> 15)) | 0;
                            E = ((r >>> ((j + 7) | 0)) & 1) | (j << 1);
                        }
                    else E = 0;
                    j = c[(8984 + (E << 2)) >> 2] | 0;
                    a: do
                        if (!j) {
                            F = g;
                            G = 0;
                            H = 0;
                        } else {
                            if ((E | 0) == 31) I = 0;
                            else I = (25 - (E >>> 1)) | 0;
                            f = g;
                            t = 0;
                            e = r << I;
                            k = j;
                            q = 0;
                            while (1) {
                                h = c[(k + 4) >> 2] & -8;
                                n = (h - r) | 0;
                                if (n >>> 0 < f >>> 0)
                                    if ((h | 0) == (r | 0)) {
                                        F = n;
                                        G = k;
                                        H = k;
                                        break a;
                                    } else {
                                        J = n;
                                        K = k;
                                    }
                                else {
                                    J = f;
                                    K = q;
                                }
                                n = c[(k + 20) >> 2] | 0;
                                k = c[(k + ((e >>> 31) << 2) + 16) >> 2] | 0;
                                h = ((n | 0) == 0) | ((n | 0) == (k | 0)) ? t : n;
                                if (!k) {
                                    F = J;
                                    G = h;
                                    H = K;
                                    break;
                                } else {
                                    f = J;
                                    t = h;
                                    e = e << 1;
                                    q = K;
                                }
                            }
                        }
                    while (0);
                    if (((G | 0) == 0) & ((H | 0) == 0)) {
                        j = 2 << E;
                        g = m & (j | (0 - j));
                        if (!g) {
                            D = r;
                            break;
                        }
                        j = ((g & (0 - g)) + -1) | 0;
                        g = (j >>> 12) & 16;
                        l = j >>> g;
                        j = (l >>> 5) & 8;
                        o = l >>> j;
                        l = (o >>> 2) & 4;
                        s = o >>> l;
                        o = (s >>> 1) & 2;
                        q = s >>> o;
                        s = (q >>> 1) & 1;
                        L = c[(8984 + (((j | g | l | o | s) + (q >>> s)) << 2)) >> 2] | 0;
                    } else L = G;
                    if (!L) {
                        M = F;
                        N = H;
                    } else {
                        s = F;
                        q = L;
                        o = H;
                        while (1) {
                            l = ((c[(q + 4) >> 2] & -8) - r) | 0;
                            g = l >>> 0 < s >>> 0;
                            j = g ? l : s;
                            l = g ? q : o;
                            g = c[(q + 16) >> 2] | 0;
                            if (g) {
                                s = j;
                                q = g;
                                o = l;
                                continue;
                            }
                            q = c[(q + 20) >> 2] | 0;
                            if (!q) {
                                M = j;
                                N = l;
                                break;
                            } else {
                                s = j;
                                o = l;
                            }
                        }
                    }
                    if ((N | 0) != 0 ? M >>> 0 < (((c[2172] | 0) - r) | 0) >>> 0 : 0) {
                        o = c[2174] | 0;
                        if (N >>> 0 < o >>> 0) le();
                        s = (N + r) | 0;
                        if (N >>> 0 >= s >>> 0) le();
                        q = c[(N + 24) >> 2] | 0;
                        m = c[(N + 12) >> 2] | 0;
                        do
                            if ((m | 0) == (N | 0)) {
                                l = (N + 20) | 0;
                                j = c[l >> 2] | 0;
                                if (!j) {
                                    g = (N + 16) | 0;
                                    e = c[g >> 2] | 0;
                                    if (!e) {
                                        O = 0;
                                        break;
                                    } else {
                                        P = e;
                                        Q = g;
                                    }
                                } else {
                                    P = j;
                                    Q = l;
                                }
                                while (1) {
                                    l = (P + 20) | 0;
                                    j = c[l >> 2] | 0;
                                    if (j) {
                                        P = j;
                                        Q = l;
                                        continue;
                                    }
                                    l = (P + 16) | 0;
                                    j = c[l >> 2] | 0;
                                    if (!j) break;
                                    else {
                                        P = j;
                                        Q = l;
                                    }
                                }
                                if (Q >>> 0 < o >>> 0) le();
                                else {
                                    c[Q >> 2] = 0;
                                    O = P;
                                    break;
                                }
                            } else {
                                l = c[(N + 8) >> 2] | 0;
                                if (l >>> 0 < o >>> 0) le();
                                j = (l + 12) | 0;
                                if ((c[j >> 2] | 0) != (N | 0)) le();
                                g = (m + 8) | 0;
                                if ((c[g >> 2] | 0) == (N | 0)) {
                                    c[j >> 2] = m;
                                    c[g >> 2] = l;
                                    O = m;
                                    break;
                                } else le();
                            }
                        while (0);
                        do
                            if (q) {
                                m = c[(N + 28) >> 2] | 0;
                                o = (8984 + (m << 2)) | 0;
                                if ((N | 0) == (c[o >> 2] | 0)) {
                                    c[o >> 2] = O;
                                    if (!O) {
                                        c[2171] = c[2171] & ~(1 << m);
                                        break;
                                    }
                                } else {
                                    if (q >>> 0 < (c[2174] | 0) >>> 0) le();
                                    m = (q + 16) | 0;
                                    if ((c[m >> 2] | 0) == (N | 0)) c[m >> 2] = O;
                                    else c[(q + 20) >> 2] = O;
                                    if (!O) break;
                                }
                                m = c[2174] | 0;
                                if (O >>> 0 < m >>> 0) le();
                                c[(O + 24) >> 2] = q;
                                o = c[(N + 16) >> 2] | 0;
                                do
                                    if (o)
                                        if (o >>> 0 < m >>> 0) le();
                                        else {
                                            c[(O + 16) >> 2] = o;
                                            c[(o + 24) >> 2] = O;
                                            break;
                                        }
                                while (0);
                                o = c[(N + 20) >> 2] | 0;
                                if (o)
                                    if (o >>> 0 < (c[2174] | 0) >>> 0) le();
                                    else {
                                        c[(O + 20) >> 2] = o;
                                        c[(o + 24) >> 2] = O;
                                        break;
                                    }
                            }
                        while (0);
                        b: do
                            if (M >>> 0 >= 16) {
                                c[(N + 4) >> 2] = r | 3;
                                c[(N + (r | 4)) >> 2] = M | 1;
                                c[(N + (M + r)) >> 2] = M;
                                q = M >>> 3;
                                if (M >>> 0 < 256) {
                                    o = q << 1;
                                    m = (8720 + (o << 2)) | 0;
                                    l = c[2170] | 0;
                                    g = 1 << q;
                                    do
                                        if (!(l & g)) {
                                            c[2170] = l | g;
                                            R = (8720 + ((o + 2) << 2)) | 0;
                                            S = m;
                                        } else {
                                            q = (8720 + ((o + 2) << 2)) | 0;
                                            j = c[q >> 2] | 0;
                                            if (j >>> 0 >= (c[2174] | 0) >>> 0) {
                                                R = q;
                                                S = j;
                                                break;
                                            }
                                            le();
                                        }
                                    while (0);
                                    c[R >> 2] = s;
                                    c[(S + 12) >> 2] = s;
                                    c[(N + (r + 8)) >> 2] = S;
                                    c[(N + (r + 12)) >> 2] = m;
                                    break;
                                }
                                o = M >>> 8;
                                if (o)
                                    if (M >>> 0 > 16777215) T = 31;
                                    else {
                                        g = (((o + 1048320) | 0) >>> 16) & 8;
                                        l = o << g;
                                        o = (((l + 520192) | 0) >>> 16) & 4;
                                        j = l << o;
                                        l = (((j + 245760) | 0) >>> 16) & 2;
                                        q = (14 - (o | g | l) + ((j << l) >>> 15)) | 0;
                                        T = ((M >>> ((q + 7) | 0)) & 1) | (q << 1);
                                    }
                                else T = 0;
                                q = (8984 + (T << 2)) | 0;
                                c[(N + (r + 28)) >> 2] = T;
                                c[(N + (r + 20)) >> 2] = 0;
                                c[(N + (r + 16)) >> 2] = 0;
                                l = c[2171] | 0;
                                j = 1 << T;
                                if (!(l & j)) {
                                    c[2171] = l | j;
                                    c[q >> 2] = s;
                                    c[(N + (r + 24)) >> 2] = q;
                                    c[(N + (r + 12)) >> 2] = s;
                                    c[(N + (r + 8)) >> 2] = s;
                                    break;
                                }
                                j = c[q >> 2] | 0;
                                if ((T | 0) == 31) U = 0;
                                else U = (25 - (T >>> 1)) | 0;
                                c: do
                                    if (((c[(j + 4) >> 2] & -8) | 0) != (M | 0)) {
                                        q = M << U;
                                        l = j;
                                        while (1) {
                                            V = (l + ((q >>> 31) << 2) + 16) | 0;
                                            g = c[V >> 2] | 0;
                                            if (!g) break;
                                            if (((c[(g + 4) >> 2] & -8) | 0) == (M | 0)) {
                                                W = g;
                                                break c;
                                            } else {
                                                q = q << 1;
                                                l = g;
                                            }
                                        }
                                        if (V >>> 0 < (c[2174] | 0) >>> 0) le();
                                        else {
                                            c[V >> 2] = s;
                                            c[(N + (r + 24)) >> 2] = l;
                                            c[(N + (r + 12)) >> 2] = s;
                                            c[(N + (r + 8)) >> 2] = s;
                                            break b;
                                        }
                                    } else W = j;
                                while (0);
                                j = (W + 8) | 0;
                                m = c[j >> 2] | 0;
                                q = c[2174] | 0;
                                if ((W >>> 0 >= q >>> 0) & (m >>> 0 >= q >>> 0)) {
                                    c[(m + 12) >> 2] = s;
                                    c[j >> 2] = s;
                                    c[(N + (r + 8)) >> 2] = m;
                                    c[(N + (r + 12)) >> 2] = W;
                                    c[(N + (r + 24)) >> 2] = 0;
                                    break;
                                } else le();
                            } else {
                                m = (M + r) | 0;
                                c[(N + 4) >> 2] = m | 3;
                                j = (N + (m + 4)) | 0;
                                c[j >> 2] = c[j >> 2] | 1;
                            }
                        while (0);
                        p = (N + 8) | 0;
                        i = b;
                        return p | 0;
                    } else D = r;
                } else D = r;
            } else D = -1;
        while (0);
        N = c[2172] | 0;
        if (N >>> 0 >= D >>> 0) {
            M = (N - D) | 0;
            W = c[2175] | 0;
            if (M >>> 0 > 15) {
                c[2175] = W + D;
                c[2172] = M;
                c[(W + (D + 4)) >> 2] = M | 1;
                c[(W + N) >> 2] = M;
                c[(W + 4) >> 2] = D | 3;
            } else {
                c[2172] = 0;
                c[2175] = 0;
                c[(W + 4) >> 2] = N | 3;
                M = (W + (N + 4)) | 0;
                c[M >> 2] = c[M >> 2] | 1;
            }
            p = (W + 8) | 0;
            i = b;
            return p | 0;
        }
        W = c[2173] | 0;
        if (W >>> 0 > D >>> 0) {
            M = (W - D) | 0;
            c[2173] = M;
            W = c[2176] | 0;
            c[2176] = W + D;
            c[(W + (D + 4)) >> 2] = M | 1;
            c[(W + 4) >> 2] = D | 3;
            p = (W + 8) | 0;
            i = b;
            return p | 0;
        }
        do
            if (!(c[2288] | 0)) {
                W = hb(30) | 0;
                if (!((W + -1) & W)) {
                    c[2290] = W;
                    c[2289] = W;
                    c[2291] = -1;
                    c[2292] = -1;
                    c[2293] = 0;
                    c[2281] = 0;
                    c[2288] = ((_c(0) | 0) & -16) ^ 1431655768;
                    break;
                } else le();
            }
        while (0);
        W = (D + 48) | 0;
        M = c[2290] | 0;
        N = (D + 47) | 0;
        V = (M + N) | 0;
        U = (0 - M) | 0;
        M = V & U;
        if (M >>> 0 <= D >>> 0) {
            p = 0;
            i = b;
            return p | 0;
        }
        T = c[2280] | 0;
        if ((T | 0) != 0 ? ((S = c[2278] | 0), (R = (S + M) | 0), (R >>> 0 <= S >>> 0) | (R >>> 0 > T >>> 0)) : 0) {
            p = 0;
            i = b;
            return p | 0;
        }
        d: do
            if (!(c[2281] & 4)) {
                T = c[2176] | 0;
                e: do
                    if (T) {
                        R = 9128 | 0;
                        while (1) {
                            S = c[R >> 2] | 0;
                            if (S >>> 0 <= T >>> 0 ? ((X = (R + 4) | 0), ((S + (c[X >> 2] | 0)) | 0) >>> 0 > T >>> 0) : 0) break;
                            S = c[(R + 8) >> 2] | 0;
                            if (!S) {
                                Y = 181;
                                break e;
                            } else R = S;
                        }
                        if (R) {
                            S = (V - (c[2173] | 0)) & U;
                            if (S >>> 0 < 2147483647) {
                                O = $a(S | 0) | 0;
                                if ((O | 0) == (((c[R >> 2] | 0) + (c[X >> 2] | 0)) | 0)) {
                                    Z = O;
                                    _ = S;
                                    Y = 190;
                                } else {
                                    $ = O;
                                    aa = S;
                                    Y = 191;
                                }
                            } else ba = 0;
                        } else Y = 181;
                    } else Y = 181;
                while (0);
                do
                    if ((Y | 0) == 181) {
                        T = $a(0) | 0;
                        if ((T | 0) != (-1 | 0)) {
                            r = T;
                            S = c[2289] | 0;
                            O = (S + -1) | 0;
                            if (!(O & r)) ca = M;
                            else ca = (M - r + ((O + r) & (0 - S))) | 0;
                            S = c[2278] | 0;
                            r = (S + ca) | 0;
                            if ((ca >>> 0 > D >>> 0) & (ca >>> 0 < 2147483647)) {
                                O = c[2280] | 0;
                                if ((O | 0) != 0 ? (r >>> 0 <= S >>> 0) | (r >>> 0 > O >>> 0) : 0) {
                                    ba = 0;
                                    break;
                                }
                                O = $a(ca | 0) | 0;
                                if ((O | 0) == (T | 0)) {
                                    Z = T;
                                    _ = ca;
                                    Y = 190;
                                } else {
                                    $ = O;
                                    aa = ca;
                                    Y = 191;
                                }
                            } else ba = 0;
                        } else ba = 0;
                    }
                while (0);
                f: do
                    if ((Y | 0) == 190)
                        if ((Z | 0) == (-1 | 0)) ba = _;
                        else {
                            da = Z;
                            ea = _;
                            Y = 201;
                            break d;
                        }
                    else if ((Y | 0) == 191) {
                        O = (0 - aa) | 0;
                        do
                            if ((($ | 0) != (-1 | 0)) & (aa >>> 0 < 2147483647) & (W >>> 0 > aa >>> 0) ? ((T = c[2290] | 0), (r = (N - aa + T) & (0 - T)), r >>> 0 < 2147483647) : 0)
                                if (($a(r | 0) | 0) == (-1 | 0)) {
                                    $a(O | 0) | 0;
                                    ba = 0;
                                    break f;
                                } else {
                                    fa = (r + aa) | 0;
                                    break;
                                }
                            else fa = aa;
                        while (0);
                        if (($ | 0) == (-1 | 0)) ba = 0;
                        else {
                            da = $;
                            ea = fa;
                            Y = 201;
                            break d;
                        }
                    }
                while (0);
                c[2281] = c[2281] | 4;
                ga = ba;
                Y = 198;
            } else {
                ga = 0;
                Y = 198;
            }
        while (0);
        if (
            (((Y | 0) == 198 ? M >>> 0 < 2147483647 : 0) ? ((ba = $a(M | 0) | 0), (M = $a(0) | 0), ((ba | 0) != (-1 | 0)) & ((M | 0) != (-1 | 0)) & (ba >>> 0 < M >>> 0)) : 0)
                ? ((fa = (M - ba) | 0), (M = fa >>> 0 > ((D + 40) | 0) >>> 0), M)
                : 0
        ) {
            da = ba;
            ea = M ? fa : ga;
            Y = 201;
        }
        if ((Y | 0) == 201) {
            ga = ((c[2278] | 0) + ea) | 0;
            c[2278] = ga;
            if (ga >>> 0 > (c[2279] | 0) >>> 0) c[2279] = ga;
            ga = c[2176] | 0;
            g: do
                if (ga) {
                    fa = 9128 | 0;
                    while (1) {
                        ha = c[fa >> 2] | 0;
                        ia = (fa + 4) | 0;
                        ja = c[ia >> 2] | 0;
                        if ((da | 0) == ((ha + ja) | 0)) {
                            Y = 213;
                            break;
                        }
                        M = c[(fa + 8) >> 2] | 0;
                        if (!M) break;
                        else fa = M;
                    }
                    if (((Y | 0) == 213 ? ((c[(fa + 12) >> 2] & 8) | 0) == 0 : 0) ? (ga >>> 0 >= ha >>> 0) & (ga >>> 0 < da >>> 0) : 0) {
                        c[ia >> 2] = ja + ea;
                        M = ((c[2173] | 0) + ea) | 0;
                        ba = (ga + 8) | 0;
                        if (!(ba & 7)) ka = 0;
                        else ka = (0 - ba) & 7;
                        ba = (M - ka) | 0;
                        c[2176] = ga + ka;
                        c[2173] = ba;
                        c[(ga + (ka + 4)) >> 2] = ba | 1;
                        c[(ga + (M + 4)) >> 2] = 40;
                        c[2177] = c[2292];
                        break;
                    }
                    M = c[2174] | 0;
                    if (da >>> 0 < M >>> 0) {
                        c[2174] = da;
                        la = da;
                    } else la = M;
                    M = (da + ea) | 0;
                    ba = 9128 | 0;
                    while (1) {
                        if ((c[ba >> 2] | 0) == (M | 0)) {
                            Y = 223;
                            break;
                        }
                        $ = c[(ba + 8) >> 2] | 0;
                        if (!$) break;
                        else ba = $;
                    }
                    if ((Y | 0) == 223 ? ((c[(ba + 12) >> 2] & 8) | 0) == 0 : 0) {
                        c[ba >> 2] = da;
                        M = (ba + 4) | 0;
                        c[M >> 2] = (c[M >> 2] | 0) + ea;
                        M = (da + 8) | 0;
                        if (!(M & 7)) ma = 0;
                        else ma = (0 - M) & 7;
                        M = (da + (ea + 8)) | 0;
                        if (!(M & 7)) na = 0;
                        else na = (0 - M) & 7;
                        M = (da + (na + ea)) | 0;
                        fa = (ma + D) | 0;
                        $ = (da + fa) | 0;
                        aa = (M - (da + ma) - D) | 0;
                        c[(da + (ma + 4)) >> 2] = D | 3;
                        h: do
                            if ((M | 0) != (ga | 0)) {
                                if ((M | 0) == (c[2175] | 0)) {
                                    N = ((c[2172] | 0) + aa) | 0;
                                    c[2172] = N;
                                    c[2175] = $;
                                    c[(da + (fa + 4)) >> 2] = N | 1;
                                    c[(da + (N + fa)) >> 2] = N;
                                    break;
                                }
                                N = (ea + 4) | 0;
                                W = c[(da + (N + na)) >> 2] | 0;
                                if (((W & 3) | 0) == 1) {
                                    _ = W & -8;
                                    Z = W >>> 3;
                                    i: do
                                        if (W >>> 0 >= 256) {
                                            ca = c[(da + ((na | 24) + ea)) >> 2] | 0;
                                            X = c[(da + (ea + 12 + na)) >> 2] | 0;
                                            do
                                                if ((X | 0) == (M | 0)) {
                                                    U = na | 16;
                                                    V = (da + (N + U)) | 0;
                                                    O = c[V >> 2] | 0;
                                                    if (!O) {
                                                        R = (da + (U + ea)) | 0;
                                                        U = c[R >> 2] | 0;
                                                        if (!U) {
                                                            oa = 0;
                                                            break;
                                                        } else {
                                                            pa = U;
                                                            qa = R;
                                                        }
                                                    } else {
                                                        pa = O;
                                                        qa = V;
                                                    }
                                                    while (1) {
                                                        V = (pa + 20) | 0;
                                                        O = c[V >> 2] | 0;
                                                        if (O) {
                                                            pa = O;
                                                            qa = V;
                                                            continue;
                                                        }
                                                        V = (pa + 16) | 0;
                                                        O = c[V >> 2] | 0;
                                                        if (!O) break;
                                                        else {
                                                            pa = O;
                                                            qa = V;
                                                        }
                                                    }
                                                    if (qa >>> 0 < la >>> 0) le();
                                                    else {
                                                        c[qa >> 2] = 0;
                                                        oa = pa;
                                                        break;
                                                    }
                                                } else {
                                                    V = c[(da + ((na | 8) + ea)) >> 2] | 0;
                                                    if (V >>> 0 < la >>> 0) le();
                                                    O = (V + 12) | 0;
                                                    if ((c[O >> 2] | 0) != (M | 0)) le();
                                                    R = (X + 8) | 0;
                                                    if ((c[R >> 2] | 0) == (M | 0)) {
                                                        c[O >> 2] = X;
                                                        c[R >> 2] = V;
                                                        oa = X;
                                                        break;
                                                    } else le();
                                                }
                                            while (0);
                                            if (!ca) break;
                                            X = c[(da + (ea + 28 + na)) >> 2] | 0;
                                            l = (8984 + (X << 2)) | 0;
                                            do
                                                if ((M | 0) != (c[l >> 2] | 0)) {
                                                    if (ca >>> 0 < (c[2174] | 0) >>> 0) le();
                                                    V = (ca + 16) | 0;
                                                    if ((c[V >> 2] | 0) == (M | 0)) c[V >> 2] = oa;
                                                    else c[(ca + 20) >> 2] = oa;
                                                    if (!oa) break i;
                                                } else {
                                                    c[l >> 2] = oa;
                                                    if (oa) break;
                                                    c[2171] = c[2171] & ~(1 << X);
                                                    break i;
                                                }
                                            while (0);
                                            X = c[2174] | 0;
                                            if (oa >>> 0 < X >>> 0) le();
                                            c[(oa + 24) >> 2] = ca;
                                            l = na | 16;
                                            V = c[(da + (l + ea)) >> 2] | 0;
                                            do
                                                if (V)
                                                    if (V >>> 0 < X >>> 0) le();
                                                    else {
                                                        c[(oa + 16) >> 2] = V;
                                                        c[(V + 24) >> 2] = oa;
                                                        break;
                                                    }
                                            while (0);
                                            V = c[(da + (N + l)) >> 2] | 0;
                                            if (!V) break;
                                            if (V >>> 0 < (c[2174] | 0) >>> 0) le();
                                            else {
                                                c[(oa + 20) >> 2] = V;
                                                c[(V + 24) >> 2] = oa;
                                                break;
                                            }
                                        } else {
                                            V = c[(da + ((na | 8) + ea)) >> 2] | 0;
                                            X = c[(da + (ea + 12 + na)) >> 2] | 0;
                                            ca = (8720 + ((Z << 1) << 2)) | 0;
                                            do
                                                if ((V | 0) != (ca | 0)) {
                                                    if (V >>> 0 < la >>> 0) le();
                                                    if ((c[(V + 12) >> 2] | 0) == (M | 0)) break;
                                                    le();
                                                }
                                            while (0);
                                            if ((X | 0) == (V | 0)) {
                                                c[2170] = c[2170] & ~(1 << Z);
                                                break;
                                            }
                                            do
                                                if ((X | 0) == (ca | 0)) ra = (X + 8) | 0;
                                                else {
                                                    if (X >>> 0 < la >>> 0) le();
                                                    l = (X + 8) | 0;
                                                    if ((c[l >> 2] | 0) == (M | 0)) {
                                                        ra = l;
                                                        break;
                                                    }
                                                    le();
                                                }
                                            while (0);
                                            c[(V + 12) >> 2] = X;
                                            c[ra >> 2] = V;
                                        }
                                    while (0);
                                    sa = (da + ((_ | na) + ea)) | 0;
                                    ta = (_ + aa) | 0;
                                } else {
                                    sa = M;
                                    ta = aa;
                                }
                                Z = (sa + 4) | 0;
                                c[Z >> 2] = c[Z >> 2] & -2;
                                c[(da + (fa + 4)) >> 2] = ta | 1;
                                c[(da + (ta + fa)) >> 2] = ta;
                                Z = ta >>> 3;
                                if (ta >>> 0 < 256) {
                                    N = Z << 1;
                                    W = (8720 + (N << 2)) | 0;
                                    ca = c[2170] | 0;
                                    l = 1 << Z;
                                    do
                                        if (!(ca & l)) {
                                            c[2170] = ca | l;
                                            ua = (8720 + ((N + 2) << 2)) | 0;
                                            va = W;
                                        } else {
                                            Z = (8720 + ((N + 2) << 2)) | 0;
                                            R = c[Z >> 2] | 0;
                                            if (R >>> 0 >= (c[2174] | 0) >>> 0) {
                                                ua = Z;
                                                va = R;
                                                break;
                                            }
                                            le();
                                        }
                                    while (0);
                                    c[ua >> 2] = $;
                                    c[(va + 12) >> 2] = $;
                                    c[(da + (fa + 8)) >> 2] = va;
                                    c[(da + (fa + 12)) >> 2] = W;
                                    break;
                                }
                                N = ta >>> 8;
                                do
                                    if (!N) wa = 0;
                                    else {
                                        if (ta >>> 0 > 16777215) {
                                            wa = 31;
                                            break;
                                        }
                                        l = (((N + 1048320) | 0) >>> 16) & 8;
                                        ca = N << l;
                                        _ = (((ca + 520192) | 0) >>> 16) & 4;
                                        R = ca << _;
                                        ca = (((R + 245760) | 0) >>> 16) & 2;
                                        Z = (14 - (_ | l | ca) + ((R << ca) >>> 15)) | 0;
                                        wa = ((ta >>> ((Z + 7) | 0)) & 1) | (Z << 1);
                                    }
                                while (0);
                                N = (8984 + (wa << 2)) | 0;
                                c[(da + (fa + 28)) >> 2] = wa;
                                c[(da + (fa + 20)) >> 2] = 0;
                                c[(da + (fa + 16)) >> 2] = 0;
                                W = c[2171] | 0;
                                Z = 1 << wa;
                                if (!(W & Z)) {
                                    c[2171] = W | Z;
                                    c[N >> 2] = $;
                                    c[(da + (fa + 24)) >> 2] = N;
                                    c[(da + (fa + 12)) >> 2] = $;
                                    c[(da + (fa + 8)) >> 2] = $;
                                    break;
                                }
                                Z = c[N >> 2] | 0;
                                if ((wa | 0) == 31) xa = 0;
                                else xa = (25 - (wa >>> 1)) | 0;
                                j: do
                                    if (((c[(Z + 4) >> 2] & -8) | 0) != (ta | 0)) {
                                        N = ta << xa;
                                        W = Z;
                                        while (1) {
                                            ya = (W + ((N >>> 31) << 2) + 16) | 0;
                                            ca = c[ya >> 2] | 0;
                                            if (!ca) break;
                                            if (((c[(ca + 4) >> 2] & -8) | 0) == (ta | 0)) {
                                                za = ca;
                                                break j;
                                            } else {
                                                N = N << 1;
                                                W = ca;
                                            }
                                        }
                                        if (ya >>> 0 < (c[2174] | 0) >>> 0) le();
                                        else {
                                            c[ya >> 2] = $;
                                            c[(da + (fa + 24)) >> 2] = W;
                                            c[(da + (fa + 12)) >> 2] = $;
                                            c[(da + (fa + 8)) >> 2] = $;
                                            break h;
                                        }
                                    } else za = Z;
                                while (0);
                                Z = (za + 8) | 0;
                                N = c[Z >> 2] | 0;
                                V = c[2174] | 0;
                                if ((za >>> 0 >= V >>> 0) & (N >>> 0 >= V >>> 0)) {
                                    c[(N + 12) >> 2] = $;
                                    c[Z >> 2] = $;
                                    c[(da + (fa + 8)) >> 2] = N;
                                    c[(da + (fa + 12)) >> 2] = za;
                                    c[(da + (fa + 24)) >> 2] = 0;
                                    break;
                                } else le();
                            } else {
                                N = ((c[2173] | 0) + aa) | 0;
                                c[2173] = N;
                                c[2176] = $;
                                c[(da + (fa + 4)) >> 2] = N | 1;
                            }
                        while (0);
                        p = (da + (ma | 8)) | 0;
                        i = b;
                        return p | 0;
                    }
                    fa = 9128 | 0;
                    while (1) {
                        Aa = c[fa >> 2] | 0;
                        if (Aa >>> 0 <= ga >>> 0 ? ((Ba = c[(fa + 4) >> 2] | 0), (Ca = (Aa + Ba) | 0), Ca >>> 0 > ga >>> 0) : 0) break;
                        fa = c[(fa + 8) >> 2] | 0;
                    }
                    fa = (Aa + (Ba + -39)) | 0;
                    if (!(fa & 7)) Da = 0;
                    else Da = (0 - fa) & 7;
                    fa = (Aa + (Ba + -47 + Da)) | 0;
                    $ = fa >>> 0 < ((ga + 16) | 0) >>> 0 ? ga : fa;
                    fa = ($ + 8) | 0;
                    aa = (da + 8) | 0;
                    if (!(aa & 7)) Ea = 0;
                    else Ea = (0 - aa) & 7;
                    aa = (ea + -40 - Ea) | 0;
                    c[2176] = da + Ea;
                    c[2173] = aa;
                    c[(da + (Ea + 4)) >> 2] = aa | 1;
                    c[(da + (ea + -36)) >> 2] = 40;
                    c[2177] = c[2292];
                    c[($ + 4) >> 2] = 27;
                    c[(fa + 0) >> 2] = c[2282];
                    c[(fa + 4) >> 2] = c[2283];
                    c[(fa + 8) >> 2] = c[2284];
                    c[(fa + 12) >> 2] = c[2285];
                    c[2282] = da;
                    c[2283] = ea;
                    c[2285] = 0;
                    c[2284] = fa;
                    fa = ($ + 28) | 0;
                    c[fa >> 2] = 7;
                    if ((($ + 32) | 0) >>> 0 < Ca >>> 0) {
                        aa = fa;
                        do {
                            fa = aa;
                            aa = (aa + 4) | 0;
                            c[aa >> 2] = 7;
                        } while (((fa + 8) | 0) >>> 0 < Ca >>> 0);
                    }
                    if (($ | 0) != (ga | 0)) {
                        aa = ($ - ga) | 0;
                        fa = (ga + (aa + 4)) | 0;
                        c[fa >> 2] = c[fa >> 2] & -2;
                        c[(ga + 4) >> 2] = aa | 1;
                        c[(ga + aa) >> 2] = aa;
                        fa = aa >>> 3;
                        if (aa >>> 0 < 256) {
                            M = fa << 1;
                            ba = (8720 + (M << 2)) | 0;
                            N = c[2170] | 0;
                            Z = 1 << fa;
                            do
                                if (!(N & Z)) {
                                    c[2170] = N | Z;
                                    Fa = (8720 + ((M + 2) << 2)) | 0;
                                    Ga = ba;
                                } else {
                                    fa = (8720 + ((M + 2) << 2)) | 0;
                                    V = c[fa >> 2] | 0;
                                    if (V >>> 0 >= (c[2174] | 0) >>> 0) {
                                        Fa = fa;
                                        Ga = V;
                                        break;
                                    }
                                    le();
                                }
                            while (0);
                            c[Fa >> 2] = ga;
                            c[(Ga + 12) >> 2] = ga;
                            c[(ga + 8) >> 2] = Ga;
                            c[(ga + 12) >> 2] = ba;
                            break;
                        }
                        M = aa >>> 8;
                        if (M)
                            if (aa >>> 0 > 16777215) Ha = 31;
                            else {
                                Z = (((M + 1048320) | 0) >>> 16) & 8;
                                N = M << Z;
                                M = (((N + 520192) | 0) >>> 16) & 4;
                                $ = N << M;
                                N = ((($ + 245760) | 0) >>> 16) & 2;
                                V = (14 - (M | Z | N) + (($ << N) >>> 15)) | 0;
                                Ha = ((aa >>> ((V + 7) | 0)) & 1) | (V << 1);
                            }
                        else Ha = 0;
                        V = (8984 + (Ha << 2)) | 0;
                        c[(ga + 28) >> 2] = Ha;
                        c[(ga + 20) >> 2] = 0;
                        c[(ga + 16) >> 2] = 0;
                        N = c[2171] | 0;
                        $ = 1 << Ha;
                        if (!(N & $)) {
                            c[2171] = N | $;
                            c[V >> 2] = ga;
                            c[(ga + 24) >> 2] = V;
                            c[(ga + 12) >> 2] = ga;
                            c[(ga + 8) >> 2] = ga;
                            break;
                        }
                        $ = c[V >> 2] | 0;
                        if ((Ha | 0) == 31) Ia = 0;
                        else Ia = (25 - (Ha >>> 1)) | 0;
                        k: do
                            if (((c[($ + 4) >> 2] & -8) | 0) != (aa | 0)) {
                                V = aa << Ia;
                                N = $;
                                while (1) {
                                    Ja = (N + ((V >>> 31) << 2) + 16) | 0;
                                    Z = c[Ja >> 2] | 0;
                                    if (!Z) break;
                                    if (((c[(Z + 4) >> 2] & -8) | 0) == (aa | 0)) {
                                        Ka = Z;
                                        break k;
                                    } else {
                                        V = V << 1;
                                        N = Z;
                                    }
                                }
                                if (Ja >>> 0 < (c[2174] | 0) >>> 0) le();
                                else {
                                    c[Ja >> 2] = ga;
                                    c[(ga + 24) >> 2] = N;
                                    c[(ga + 12) >> 2] = ga;
                                    c[(ga + 8) >> 2] = ga;
                                    break g;
                                }
                            } else Ka = $;
                        while (0);
                        $ = (Ka + 8) | 0;
                        aa = c[$ >> 2] | 0;
                        ba = c[2174] | 0;
                        if ((Ka >>> 0 >= ba >>> 0) & (aa >>> 0 >= ba >>> 0)) {
                            c[(aa + 12) >> 2] = ga;
                            c[$ >> 2] = ga;
                            c[(ga + 8) >> 2] = aa;
                            c[(ga + 12) >> 2] = Ka;
                            c[(ga + 24) >> 2] = 0;
                            break;
                        } else le();
                    }
                } else {
                    aa = c[2174] | 0;
                    if (((aa | 0) == 0) | (da >>> 0 < aa >>> 0)) c[2174] = da;
                    c[2282] = da;
                    c[2283] = ea;
                    c[2285] = 0;
                    c[2179] = c[2288];
                    c[2178] = -1;
                    aa = 0;
                    do {
                        $ = aa << 1;
                        ba = (8720 + ($ << 2)) | 0;
                        c[(8720 + (($ + 3) << 2)) >> 2] = ba;
                        c[(8720 + (($ + 2) << 2)) >> 2] = ba;
                        aa = (aa + 1) | 0;
                    } while ((aa | 0) != 32);
                    aa = (da + 8) | 0;
                    if (!(aa & 7)) La = 0;
                    else La = (0 - aa) & 7;
                    aa = (ea + -40 - La) | 0;
                    c[2176] = da + La;
                    c[2173] = aa;
                    c[(da + (La + 4)) >> 2] = aa | 1;
                    c[(da + (ea + -36)) >> 2] = 40;
                    c[2177] = c[2292];
                }
            while (0);
            ea = c[2173] | 0;
            if (ea >>> 0 > D >>> 0) {
                da = (ea - D) | 0;
                c[2173] = da;
                ea = c[2176] | 0;
                c[2176] = ea + D;
                c[(ea + (D + 4)) >> 2] = da | 1;
                c[(ea + 4) >> 2] = D | 3;
                p = (ea + 8) | 0;
                i = b;
                return p | 0;
            }
        }
        c[(wd() | 0) >> 2] = 12;
        p = 0;
        i = b;
        return p | 0;
    }
    function ik(a) {
        a = a | 0;
        var b = 0,
            d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0,
            C = 0,
            D = 0,
            E = 0,
            F = 0,
            G = 0,
            H = 0,
            I = 0,
            J = 0,
            K = 0;
        b = i;
        if (!a) {
            i = b;
            return;
        }
        d = (a + -8) | 0;
        e = c[2174] | 0;
        if (d >>> 0 < e >>> 0) le();
        f = c[(a + -4) >> 2] | 0;
        g = f & 3;
        if ((g | 0) == 1) le();
        h = f & -8;
        j = (a + (h + -8)) | 0;
        do
            if (!(f & 1)) {
                k = c[d >> 2] | 0;
                if (!g) {
                    i = b;
                    return;
                }
                l = (-8 - k) | 0;
                m = (a + l) | 0;
                n = (k + h) | 0;
                if (m >>> 0 < e >>> 0) le();
                if ((m | 0) == (c[2175] | 0)) {
                    o = (a + (h + -4)) | 0;
                    p = c[o >> 2] | 0;
                    if (((p & 3) | 0) != 3) {
                        q = m;
                        r = n;
                        break;
                    }
                    c[2172] = n;
                    c[o >> 2] = p & -2;
                    c[(a + (l + 4)) >> 2] = n | 1;
                    c[j >> 2] = n;
                    i = b;
                    return;
                }
                p = k >>> 3;
                if (k >>> 0 < 256) {
                    k = c[(a + (l + 8)) >> 2] | 0;
                    o = c[(a + (l + 12)) >> 2] | 0;
                    s = (8720 + ((p << 1) << 2)) | 0;
                    if ((k | 0) != (s | 0)) {
                        if (k >>> 0 < e >>> 0) le();
                        if ((c[(k + 12) >> 2] | 0) != (m | 0)) le();
                    }
                    if ((o | 0) == (k | 0)) {
                        c[2170] = c[2170] & ~(1 << p);
                        q = m;
                        r = n;
                        break;
                    }
                    if ((o | 0) != (s | 0)) {
                        if (o >>> 0 < e >>> 0) le();
                        s = (o + 8) | 0;
                        if ((c[s >> 2] | 0) == (m | 0)) t = s;
                        else le();
                    } else t = (o + 8) | 0;
                    c[(k + 12) >> 2] = o;
                    c[t >> 2] = k;
                    q = m;
                    r = n;
                    break;
                }
                k = c[(a + (l + 24)) >> 2] | 0;
                o = c[(a + (l + 12)) >> 2] | 0;
                do
                    if ((o | 0) == (m | 0)) {
                        s = (a + (l + 20)) | 0;
                        p = c[s >> 2] | 0;
                        if (!p) {
                            u = (a + (l + 16)) | 0;
                            v = c[u >> 2] | 0;
                            if (!v) {
                                w = 0;
                                break;
                            } else {
                                x = v;
                                y = u;
                            }
                        } else {
                            x = p;
                            y = s;
                        }
                        while (1) {
                            s = (x + 20) | 0;
                            p = c[s >> 2] | 0;
                            if (p) {
                                x = p;
                                y = s;
                                continue;
                            }
                            s = (x + 16) | 0;
                            p = c[s >> 2] | 0;
                            if (!p) break;
                            else {
                                x = p;
                                y = s;
                            }
                        }
                        if (y >>> 0 < e >>> 0) le();
                        else {
                            c[y >> 2] = 0;
                            w = x;
                            break;
                        }
                    } else {
                        s = c[(a + (l + 8)) >> 2] | 0;
                        if (s >>> 0 < e >>> 0) le();
                        p = (s + 12) | 0;
                        if ((c[p >> 2] | 0) != (m | 0)) le();
                        u = (o + 8) | 0;
                        if ((c[u >> 2] | 0) == (m | 0)) {
                            c[p >> 2] = o;
                            c[u >> 2] = s;
                            w = o;
                            break;
                        } else le();
                    }
                while (0);
                if (k) {
                    o = c[(a + (l + 28)) >> 2] | 0;
                    s = (8984 + (o << 2)) | 0;
                    if ((m | 0) == (c[s >> 2] | 0)) {
                        c[s >> 2] = w;
                        if (!w) {
                            c[2171] = c[2171] & ~(1 << o);
                            q = m;
                            r = n;
                            break;
                        }
                    } else {
                        if (k >>> 0 < (c[2174] | 0) >>> 0) le();
                        o = (k + 16) | 0;
                        if ((c[o >> 2] | 0) == (m | 0)) c[o >> 2] = w;
                        else c[(k + 20) >> 2] = w;
                        if (!w) {
                            q = m;
                            r = n;
                            break;
                        }
                    }
                    o = c[2174] | 0;
                    if (w >>> 0 < o >>> 0) le();
                    c[(w + 24) >> 2] = k;
                    s = c[(a + (l + 16)) >> 2] | 0;
                    do
                        if (s)
                            if (s >>> 0 < o >>> 0) le();
                            else {
                                c[(w + 16) >> 2] = s;
                                c[(s + 24) >> 2] = w;
                                break;
                            }
                    while (0);
                    s = c[(a + (l + 20)) >> 2] | 0;
                    if (s)
                        if (s >>> 0 < (c[2174] | 0) >>> 0) le();
                        else {
                            c[(w + 20) >> 2] = s;
                            c[(s + 24) >> 2] = w;
                            q = m;
                            r = n;
                            break;
                        }
                    else {
                        q = m;
                        r = n;
                    }
                } else {
                    q = m;
                    r = n;
                }
            } else {
                q = d;
                r = h;
            }
        while (0);
        if (q >>> 0 >= j >>> 0) le();
        d = (a + (h + -4)) | 0;
        w = c[d >> 2] | 0;
        if (!(w & 1)) le();
        if (!(w & 2)) {
            if ((j | 0) == (c[2176] | 0)) {
                e = ((c[2173] | 0) + r) | 0;
                c[2173] = e;
                c[2176] = q;
                c[(q + 4) >> 2] = e | 1;
                if ((q | 0) != (c[2175] | 0)) {
                    i = b;
                    return;
                }
                c[2175] = 0;
                c[2172] = 0;
                i = b;
                return;
            }
            if ((j | 0) == (c[2175] | 0)) {
                e = ((c[2172] | 0) + r) | 0;
                c[2172] = e;
                c[2175] = q;
                c[(q + 4) >> 2] = e | 1;
                c[(q + e) >> 2] = e;
                i = b;
                return;
            }
            e = ((w & -8) + r) | 0;
            x = w >>> 3;
            do
                if (w >>> 0 >= 256) {
                    y = c[(a + (h + 16)) >> 2] | 0;
                    t = c[(a + (h | 4)) >> 2] | 0;
                    do
                        if ((t | 0) == (j | 0)) {
                            g = (a + (h + 12)) | 0;
                            f = c[g >> 2] | 0;
                            if (!f) {
                                s = (a + (h + 8)) | 0;
                                o = c[s >> 2] | 0;
                                if (!o) {
                                    z = 0;
                                    break;
                                } else {
                                    A = o;
                                    B = s;
                                }
                            } else {
                                A = f;
                                B = g;
                            }
                            while (1) {
                                g = (A + 20) | 0;
                                f = c[g >> 2] | 0;
                                if (f) {
                                    A = f;
                                    B = g;
                                    continue;
                                }
                                g = (A + 16) | 0;
                                f = c[g >> 2] | 0;
                                if (!f) break;
                                else {
                                    A = f;
                                    B = g;
                                }
                            }
                            if (B >>> 0 < (c[2174] | 0) >>> 0) le();
                            else {
                                c[B >> 2] = 0;
                                z = A;
                                break;
                            }
                        } else {
                            g = c[(a + h) >> 2] | 0;
                            if (g >>> 0 < (c[2174] | 0) >>> 0) le();
                            f = (g + 12) | 0;
                            if ((c[f >> 2] | 0) != (j | 0)) le();
                            s = (t + 8) | 0;
                            if ((c[s >> 2] | 0) == (j | 0)) {
                                c[f >> 2] = t;
                                c[s >> 2] = g;
                                z = t;
                                break;
                            } else le();
                        }
                    while (0);
                    if (y) {
                        t = c[(a + (h + 20)) >> 2] | 0;
                        n = (8984 + (t << 2)) | 0;
                        if ((j | 0) == (c[n >> 2] | 0)) {
                            c[n >> 2] = z;
                            if (!z) {
                                c[2171] = c[2171] & ~(1 << t);
                                break;
                            }
                        } else {
                            if (y >>> 0 < (c[2174] | 0) >>> 0) le();
                            t = (y + 16) | 0;
                            if ((c[t >> 2] | 0) == (j | 0)) c[t >> 2] = z;
                            else c[(y + 20) >> 2] = z;
                            if (!z) break;
                        }
                        t = c[2174] | 0;
                        if (z >>> 0 < t >>> 0) le();
                        c[(z + 24) >> 2] = y;
                        n = c[(a + (h + 8)) >> 2] | 0;
                        do
                            if (n)
                                if (n >>> 0 < t >>> 0) le();
                                else {
                                    c[(z + 16) >> 2] = n;
                                    c[(n + 24) >> 2] = z;
                                    break;
                                }
                        while (0);
                        n = c[(a + (h + 12)) >> 2] | 0;
                        if (n)
                            if (n >>> 0 < (c[2174] | 0) >>> 0) le();
                            else {
                                c[(z + 20) >> 2] = n;
                                c[(n + 24) >> 2] = z;
                                break;
                            }
                    }
                } else {
                    n = c[(a + h) >> 2] | 0;
                    t = c[(a + (h | 4)) >> 2] | 0;
                    y = (8720 + ((x << 1) << 2)) | 0;
                    if ((n | 0) != (y | 0)) {
                        if (n >>> 0 < (c[2174] | 0) >>> 0) le();
                        if ((c[(n + 12) >> 2] | 0) != (j | 0)) le();
                    }
                    if ((t | 0) == (n | 0)) {
                        c[2170] = c[2170] & ~(1 << x);
                        break;
                    }
                    if ((t | 0) != (y | 0)) {
                        if (t >>> 0 < (c[2174] | 0) >>> 0) le();
                        y = (t + 8) | 0;
                        if ((c[y >> 2] | 0) == (j | 0)) C = y;
                        else le();
                    } else C = (t + 8) | 0;
                    c[(n + 12) >> 2] = t;
                    c[C >> 2] = n;
                }
            while (0);
            c[(q + 4) >> 2] = e | 1;
            c[(q + e) >> 2] = e;
            if ((q | 0) == (c[2175] | 0)) {
                c[2172] = e;
                i = b;
                return;
            } else D = e;
        } else {
            c[d >> 2] = w & -2;
            c[(q + 4) >> 2] = r | 1;
            c[(q + r) >> 2] = r;
            D = r;
        }
        r = D >>> 3;
        if (D >>> 0 < 256) {
            w = r << 1;
            d = (8720 + (w << 2)) | 0;
            e = c[2170] | 0;
            C = 1 << r;
            if (e & C) {
                r = (8720 + ((w + 2) << 2)) | 0;
                j = c[r >> 2] | 0;
                if (j >>> 0 < (c[2174] | 0) >>> 0) le();
                else {
                    E = r;
                    F = j;
                }
            } else {
                c[2170] = e | C;
                E = (8720 + ((w + 2) << 2)) | 0;
                F = d;
            }
            c[E >> 2] = q;
            c[(F + 12) >> 2] = q;
            c[(q + 8) >> 2] = F;
            c[(q + 12) >> 2] = d;
            i = b;
            return;
        }
        d = D >>> 8;
        if (d)
            if (D >>> 0 > 16777215) G = 31;
            else {
                F = (((d + 1048320) | 0) >>> 16) & 8;
                E = d << F;
                d = (((E + 520192) | 0) >>> 16) & 4;
                w = E << d;
                E = (((w + 245760) | 0) >>> 16) & 2;
                C = (14 - (d | F | E) + ((w << E) >>> 15)) | 0;
                G = ((D >>> ((C + 7) | 0)) & 1) | (C << 1);
            }
        else G = 0;
        C = (8984 + (G << 2)) | 0;
        c[(q + 28) >> 2] = G;
        c[(q + 20) >> 2] = 0;
        c[(q + 16) >> 2] = 0;
        E = c[2171] | 0;
        w = 1 << G;
        a: do
            if (E & w) {
                F = c[C >> 2] | 0;
                if ((G | 0) == 31) H = 0;
                else H = (25 - (G >>> 1)) | 0;
                b: do
                    if (((c[(F + 4) >> 2] & -8) | 0) != (D | 0)) {
                        d = D << H;
                        e = F;
                        while (1) {
                            I = (e + ((d >>> 31) << 2) + 16) | 0;
                            j = c[I >> 2] | 0;
                            if (!j) break;
                            if (((c[(j + 4) >> 2] & -8) | 0) == (D | 0)) {
                                J = j;
                                break b;
                            } else {
                                d = d << 1;
                                e = j;
                            }
                        }
                        if (I >>> 0 < (c[2174] | 0) >>> 0) le();
                        else {
                            c[I >> 2] = q;
                            c[(q + 24) >> 2] = e;
                            c[(q + 12) >> 2] = q;
                            c[(q + 8) >> 2] = q;
                            break a;
                        }
                    } else J = F;
                while (0);
                F = (J + 8) | 0;
                d = c[F >> 2] | 0;
                j = c[2174] | 0;
                if ((J >>> 0 >= j >>> 0) & (d >>> 0 >= j >>> 0)) {
                    c[(d + 12) >> 2] = q;
                    c[F >> 2] = q;
                    c[(q + 8) >> 2] = d;
                    c[(q + 12) >> 2] = J;
                    c[(q + 24) >> 2] = 0;
                    break;
                } else le();
            } else {
                c[2171] = E | w;
                c[C >> 2] = q;
                c[(q + 24) >> 2] = C;
                c[(q + 12) >> 2] = q;
                c[(q + 8) >> 2] = q;
            }
        while (0);
        q = ((c[2178] | 0) + -1) | 0;
        c[2178] = q;
        if (!q) K = 9136 | 0;
        else {
            i = b;
            return;
        }
        while (1) {
            q = c[K >> 2] | 0;
            if (!q) break;
            else K = (q + 8) | 0;
        }
        c[2178] = -1;
        i = b;
        return;
    }
    function jk(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0;
        d = i;
        do
            if (a) {
                if (b >>> 0 > 4294967231) {
                    c[(wd() | 0) >> 2] = 12;
                    e = 0;
                    break;
                }
                if (b >>> 0 < 11) f = 16;
                else f = (b + 11) & -8;
                g = pk((a + -8) | 0, f) | 0;
                if (g) {
                    e = (g + 8) | 0;
                    break;
                }
                g = hk(b) | 0;
                if (!g) e = 0;
                else {
                    h = c[(a + -4) >> 2] | 0;
                    j = ((h & -8) - (((h & 3) | 0) == 0 ? 8 : 4)) | 0;
                    sk(g | 0, a | 0, (j >>> 0 < b >>> 0 ? j : b) | 0) | 0;
                    ik(a);
                    e = g;
                }
            } else e = hk(b) | 0;
        while (0);
        i = d;
        return e | 0;
    }
    function kk(a) {
        a = a | 0;
        var b = 0;
        b = 9176;
        c[b >> 2] = a + -1;
        c[(b + 4) >> 2] = 0;
        return;
    }
    function lk() {
        var a = 0,
            b = 0,
            d = 0,
            e = 0;
        a = i;
        b = 9176;
        d = Hk(c[b >> 2] | 0, c[(b + 4) >> 2] | 0, 1284865837, 1481765933) | 0;
        b = vk(d | 0, E | 0, 1, 0) | 0;
        d = E;
        e = 9176;
        c[e >> 2] = b;
        c[(e + 4) >> 2] = d;
        e = wk(b | 0, d | 0, 33) | 0;
        i = a;
        return e | 0;
    }
    function mk(b, d) {
        b = b | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0;
        e = i;
        f = (d | 0) != 0;
        a: do
            if ((((b & 3) | 0) != 0) & f) {
                g = d;
                h = b;
                while (1) {
                    if (!(a[h >> 0] | 0)) {
                        j = g;
                        k = h;
                        break a;
                    }
                    l = (h + 1) | 0;
                    m = (g + -1) | 0;
                    n = (m | 0) != 0;
                    if ((((l & 3) | 0) != 0) & n) {
                        g = m;
                        h = l;
                    } else {
                        o = m;
                        p = n;
                        q = l;
                        r = 4;
                        break;
                    }
                }
            } else {
                o = d;
                p = f;
                q = b;
                r = 4;
            }
        while (0);
        b: do
            if ((r | 0) == 4)
                if (p)
                    if (a[q >> 0] | 0) {
                        c: do
                            if (o >>> 0 > 3) {
                                b = o;
                                f = q;
                                while (1) {
                                    d = c[f >> 2] | 0;
                                    if (((d & -2139062144) ^ -2139062144) & (d + -16843009)) {
                                        s = b;
                                        t = f;
                                        break c;
                                    }
                                    d = (f + 4) | 0;
                                    h = (b + -4) | 0;
                                    if (h >>> 0 > 3) {
                                        b = h;
                                        f = d;
                                    } else {
                                        s = h;
                                        t = d;
                                        break;
                                    }
                                }
                            } else {
                                s = o;
                                t = q;
                            }
                        while (0);
                        if (!s) {
                            j = 0;
                            k = t;
                        } else {
                            f = s;
                            b = t;
                            while (1) {
                                if (!(a[b >> 0] | 0)) {
                                    j = f;
                                    k = b;
                                    break b;
                                }
                                d = (b + 1) | 0;
                                f = (f + -1) | 0;
                                if (!f) {
                                    j = 0;
                                    k = d;
                                    break;
                                } else b = d;
                            }
                        }
                    } else {
                        j = o;
                        k = q;
                    }
                else {
                    j = 0;
                    k = q;
                }
        while (0);
        i = e;
        return ((j | 0) != 0 ? k : 0) | 0;
    }
    function nk(b, c, d) {
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0;
        e = i;
        a: do
            if (!d) f = 0;
            else {
                g = d;
                h = b;
                j = c;
                while (1) {
                    k = a[h >> 0] | 0;
                    l = a[j >> 0] | 0;
                    if ((k << 24) >> 24 != (l << 24) >> 24) break;
                    g = (g + -1) | 0;
                    if (!g) {
                        f = 0;
                        break a;
                    } else {
                        h = (h + 1) | 0;
                        j = (j + 1) | 0;
                    }
                }
                f = ((k & 255) - (l & 255)) | 0;
            }
        while (0);
        i = e;
        return f | 0;
    }
    function ok(b, c) {
        b = b | 0;
        c = c | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0;
        d = i;
        e = a[b >> 0] | 0;
        f = a[c >> 0] | 0;
        if ((e << 24) >> 24 == 0 ? 1 : (e << 24) >> 24 != (f << 24) >> 24) {
            g = e;
            h = f;
        } else {
            f = b;
            b = c;
            do {
                f = (f + 1) | 0;
                b = (b + 1) | 0;
                c = a[f >> 0] | 0;
                e = a[b >> 0] | 0;
            } while (!((c << 24) >> 24 == 0 ? 1 : (c << 24) >> 24 != (e << 24) >> 24));
            g = c;
            h = e;
        }
        i = d;
        return ((g & 255) - (h & 255)) | 0;
    }
    function pk(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0;
        d = i;
        e = (a + 4) | 0;
        f = c[e >> 2] | 0;
        g = f & -8;
        h = (a + g) | 0;
        j = c[2174] | 0;
        k = f & 3;
        if (!(((k | 0) != 1) & (a >>> 0 >= j >>> 0) & (a >>> 0 < h >>> 0))) le();
        l = (a + (g | 4)) | 0;
        m = c[l >> 2] | 0;
        if (!(m & 1)) le();
        if (!k) {
            if (b >>> 0 < 256) {
                n = 0;
                i = d;
                return n | 0;
            }
            if (g >>> 0 >= ((b + 4) | 0) >>> 0 ? ((g - b) | 0) >>> 0 <= (c[2290] << 1) >>> 0 : 0) {
                n = a;
                i = d;
                return n | 0;
            }
            n = 0;
            i = d;
            return n | 0;
        }
        if (g >>> 0 >= b >>> 0) {
            k = (g - b) | 0;
            if (k >>> 0 <= 15) {
                n = a;
                i = d;
                return n | 0;
            }
            c[e >> 2] = (f & 1) | b | 2;
            c[(a + (b + 4)) >> 2] = k | 3;
            c[l >> 2] = c[l >> 2] | 1;
            qk((a + b) | 0, k);
            n = a;
            i = d;
            return n | 0;
        }
        if ((h | 0) == (c[2176] | 0)) {
            k = ((c[2173] | 0) + g) | 0;
            if (k >>> 0 <= b >>> 0) {
                n = 0;
                i = d;
                return n | 0;
            }
            l = (k - b) | 0;
            c[e >> 2] = (f & 1) | b | 2;
            c[(a + (b + 4)) >> 2] = l | 1;
            c[2176] = a + b;
            c[2173] = l;
            n = a;
            i = d;
            return n | 0;
        }
        if ((h | 0) == (c[2175] | 0)) {
            l = ((c[2172] | 0) + g) | 0;
            if (l >>> 0 < b >>> 0) {
                n = 0;
                i = d;
                return n | 0;
            }
            k = (l - b) | 0;
            if (k >>> 0 > 15) {
                c[e >> 2] = (f & 1) | b | 2;
                c[(a + (b + 4)) >> 2] = k | 1;
                c[(a + l) >> 2] = k;
                o = (a + (l + 4)) | 0;
                c[o >> 2] = c[o >> 2] & -2;
                p = (a + b) | 0;
                q = k;
            } else {
                c[e >> 2] = (f & 1) | l | 2;
                k = (a + (l + 4)) | 0;
                c[k >> 2] = c[k >> 2] | 1;
                p = 0;
                q = 0;
            }
            c[2172] = q;
            c[2175] = p;
            n = a;
            i = d;
            return n | 0;
        }
        if (m & 2) {
            n = 0;
            i = d;
            return n | 0;
        }
        p = ((m & -8) + g) | 0;
        if (p >>> 0 < b >>> 0) {
            n = 0;
            i = d;
            return n | 0;
        }
        q = (p - b) | 0;
        k = m >>> 3;
        do
            if (m >>> 0 >= 256) {
                l = c[(a + (g + 24)) >> 2] | 0;
                o = c[(a + (g + 12)) >> 2] | 0;
                do
                    if ((o | 0) == (h | 0)) {
                        r = (a + (g + 20)) | 0;
                        s = c[r >> 2] | 0;
                        if (!s) {
                            t = (a + (g + 16)) | 0;
                            u = c[t >> 2] | 0;
                            if (!u) {
                                v = 0;
                                break;
                            } else {
                                w = u;
                                x = t;
                            }
                        } else {
                            w = s;
                            x = r;
                        }
                        while (1) {
                            r = (w + 20) | 0;
                            s = c[r >> 2] | 0;
                            if (s) {
                                w = s;
                                x = r;
                                continue;
                            }
                            r = (w + 16) | 0;
                            s = c[r >> 2] | 0;
                            if (!s) break;
                            else {
                                w = s;
                                x = r;
                            }
                        }
                        if (x >>> 0 < j >>> 0) le();
                        else {
                            c[x >> 2] = 0;
                            v = w;
                            break;
                        }
                    } else {
                        r = c[(a + (g + 8)) >> 2] | 0;
                        if (r >>> 0 < j >>> 0) le();
                        s = (r + 12) | 0;
                        if ((c[s >> 2] | 0) != (h | 0)) le();
                        t = (o + 8) | 0;
                        if ((c[t >> 2] | 0) == (h | 0)) {
                            c[s >> 2] = o;
                            c[t >> 2] = r;
                            v = o;
                            break;
                        } else le();
                    }
                while (0);
                if (l) {
                    o = c[(a + (g + 28)) >> 2] | 0;
                    r = (8984 + (o << 2)) | 0;
                    if ((h | 0) == (c[r >> 2] | 0)) {
                        c[r >> 2] = v;
                        if (!v) {
                            c[2171] = c[2171] & ~(1 << o);
                            break;
                        }
                    } else {
                        if (l >>> 0 < (c[2174] | 0) >>> 0) le();
                        o = (l + 16) | 0;
                        if ((c[o >> 2] | 0) == (h | 0)) c[o >> 2] = v;
                        else c[(l + 20) >> 2] = v;
                        if (!v) break;
                    }
                    o = c[2174] | 0;
                    if (v >>> 0 < o >>> 0) le();
                    c[(v + 24) >> 2] = l;
                    r = c[(a + (g + 16)) >> 2] | 0;
                    do
                        if (r)
                            if (r >>> 0 < o >>> 0) le();
                            else {
                                c[(v + 16) >> 2] = r;
                                c[(r + 24) >> 2] = v;
                                break;
                            }
                    while (0);
                    r = c[(a + (g + 20)) >> 2] | 0;
                    if (r)
                        if (r >>> 0 < (c[2174] | 0) >>> 0) le();
                        else {
                            c[(v + 20) >> 2] = r;
                            c[(r + 24) >> 2] = v;
                            break;
                        }
                }
            } else {
                r = c[(a + (g + 8)) >> 2] | 0;
                o = c[(a + (g + 12)) >> 2] | 0;
                l = (8720 + ((k << 1) << 2)) | 0;
                if ((r | 0) != (l | 0)) {
                    if (r >>> 0 < j >>> 0) le();
                    if ((c[(r + 12) >> 2] | 0) != (h | 0)) le();
                }
                if ((o | 0) == (r | 0)) {
                    c[2170] = c[2170] & ~(1 << k);
                    break;
                }
                if ((o | 0) != (l | 0)) {
                    if (o >>> 0 < j >>> 0) le();
                    l = (o + 8) | 0;
                    if ((c[l >> 2] | 0) == (h | 0)) y = l;
                    else le();
                } else y = (o + 8) | 0;
                c[(r + 12) >> 2] = o;
                c[y >> 2] = r;
            }
        while (0);
        if (q >>> 0 < 16) {
            c[e >> 2] = p | (f & 1) | 2;
            y = (a + (p | 4)) | 0;
            c[y >> 2] = c[y >> 2] | 1;
            n = a;
            i = d;
            return n | 0;
        } else {
            c[e >> 2] = (f & 1) | b | 2;
            c[(a + (b + 4)) >> 2] = q | 3;
            f = (a + (p | 4)) | 0;
            c[f >> 2] = c[f >> 2] | 1;
            qk((a + b) | 0, q);
            n = a;
            i = d;
            return n | 0;
        }
        return 0;
    }
    function qk(a, b) {
        a = a | 0;
        b = b | 0;
        var d = 0,
            e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0,
            C = 0,
            D = 0,
            E = 0,
            F = 0,
            G = 0,
            H = 0;
        d = i;
        e = (a + b) | 0;
        f = c[(a + 4) >> 2] | 0;
        do
            if (!(f & 1)) {
                g = c[a >> 2] | 0;
                if (!(f & 3)) {
                    i = d;
                    return;
                }
                h = (a + (0 - g)) | 0;
                j = (g + b) | 0;
                k = c[2174] | 0;
                if (h >>> 0 < k >>> 0) le();
                if ((h | 0) == (c[2175] | 0)) {
                    l = (a + (b + 4)) | 0;
                    m = c[l >> 2] | 0;
                    if (((m & 3) | 0) != 3) {
                        n = h;
                        o = j;
                        break;
                    }
                    c[2172] = j;
                    c[l >> 2] = m & -2;
                    c[(a + (4 - g)) >> 2] = j | 1;
                    c[e >> 2] = j;
                    i = d;
                    return;
                }
                m = g >>> 3;
                if (g >>> 0 < 256) {
                    l = c[(a + (8 - g)) >> 2] | 0;
                    p = c[(a + (12 - g)) >> 2] | 0;
                    q = (8720 + ((m << 1) << 2)) | 0;
                    if ((l | 0) != (q | 0)) {
                        if (l >>> 0 < k >>> 0) le();
                        if ((c[(l + 12) >> 2] | 0) != (h | 0)) le();
                    }
                    if ((p | 0) == (l | 0)) {
                        c[2170] = c[2170] & ~(1 << m);
                        n = h;
                        o = j;
                        break;
                    }
                    if ((p | 0) != (q | 0)) {
                        if (p >>> 0 < k >>> 0) le();
                        q = (p + 8) | 0;
                        if ((c[q >> 2] | 0) == (h | 0)) r = q;
                        else le();
                    } else r = (p + 8) | 0;
                    c[(l + 12) >> 2] = p;
                    c[r >> 2] = l;
                    n = h;
                    o = j;
                    break;
                }
                l = c[(a + (24 - g)) >> 2] | 0;
                p = c[(a + (12 - g)) >> 2] | 0;
                do
                    if ((p | 0) == (h | 0)) {
                        q = (16 - g) | 0;
                        m = (a + (q + 4)) | 0;
                        s = c[m >> 2] | 0;
                        if (!s) {
                            t = (a + q) | 0;
                            q = c[t >> 2] | 0;
                            if (!q) {
                                u = 0;
                                break;
                            } else {
                                v = q;
                                w = t;
                            }
                        } else {
                            v = s;
                            w = m;
                        }
                        while (1) {
                            m = (v + 20) | 0;
                            s = c[m >> 2] | 0;
                            if (s) {
                                v = s;
                                w = m;
                                continue;
                            }
                            m = (v + 16) | 0;
                            s = c[m >> 2] | 0;
                            if (!s) break;
                            else {
                                v = s;
                                w = m;
                            }
                        }
                        if (w >>> 0 < k >>> 0) le();
                        else {
                            c[w >> 2] = 0;
                            u = v;
                            break;
                        }
                    } else {
                        m = c[(a + (8 - g)) >> 2] | 0;
                        if (m >>> 0 < k >>> 0) le();
                        s = (m + 12) | 0;
                        if ((c[s >> 2] | 0) != (h | 0)) le();
                        t = (p + 8) | 0;
                        if ((c[t >> 2] | 0) == (h | 0)) {
                            c[s >> 2] = p;
                            c[t >> 2] = m;
                            u = p;
                            break;
                        } else le();
                    }
                while (0);
                if (l) {
                    p = c[(a + (28 - g)) >> 2] | 0;
                    k = (8984 + (p << 2)) | 0;
                    if ((h | 0) == (c[k >> 2] | 0)) {
                        c[k >> 2] = u;
                        if (!u) {
                            c[2171] = c[2171] & ~(1 << p);
                            n = h;
                            o = j;
                            break;
                        }
                    } else {
                        if (l >>> 0 < (c[2174] | 0) >>> 0) le();
                        p = (l + 16) | 0;
                        if ((c[p >> 2] | 0) == (h | 0)) c[p >> 2] = u;
                        else c[(l + 20) >> 2] = u;
                        if (!u) {
                            n = h;
                            o = j;
                            break;
                        }
                    }
                    p = c[2174] | 0;
                    if (u >>> 0 < p >>> 0) le();
                    c[(u + 24) >> 2] = l;
                    k = (16 - g) | 0;
                    m = c[(a + k) >> 2] | 0;
                    do
                        if (m)
                            if (m >>> 0 < p >>> 0) le();
                            else {
                                c[(u + 16) >> 2] = m;
                                c[(m + 24) >> 2] = u;
                                break;
                            }
                    while (0);
                    m = c[(a + (k + 4)) >> 2] | 0;
                    if (m)
                        if (m >>> 0 < (c[2174] | 0) >>> 0) le();
                        else {
                            c[(u + 20) >> 2] = m;
                            c[(m + 24) >> 2] = u;
                            n = h;
                            o = j;
                            break;
                        }
                    else {
                        n = h;
                        o = j;
                    }
                } else {
                    n = h;
                    o = j;
                }
            } else {
                n = a;
                o = b;
            }
        while (0);
        u = c[2174] | 0;
        if (e >>> 0 < u >>> 0) le();
        v = (a + (b + 4)) | 0;
        w = c[v >> 2] | 0;
        if (!(w & 2)) {
            if ((e | 0) == (c[2176] | 0)) {
                r = ((c[2173] | 0) + o) | 0;
                c[2173] = r;
                c[2176] = n;
                c[(n + 4) >> 2] = r | 1;
                if ((n | 0) != (c[2175] | 0)) {
                    i = d;
                    return;
                }
                c[2175] = 0;
                c[2172] = 0;
                i = d;
                return;
            }
            if ((e | 0) == (c[2175] | 0)) {
                r = ((c[2172] | 0) + o) | 0;
                c[2172] = r;
                c[2175] = n;
                c[(n + 4) >> 2] = r | 1;
                c[(n + r) >> 2] = r;
                i = d;
                return;
            }
            r = ((w & -8) + o) | 0;
            f = w >>> 3;
            do
                if (w >>> 0 >= 256) {
                    m = c[(a + (b + 24)) >> 2] | 0;
                    p = c[(a + (b + 12)) >> 2] | 0;
                    do
                        if ((p | 0) == (e | 0)) {
                            g = (a + (b + 20)) | 0;
                            l = c[g >> 2] | 0;
                            if (!l) {
                                t = (a + (b + 16)) | 0;
                                s = c[t >> 2] | 0;
                                if (!s) {
                                    x = 0;
                                    break;
                                } else {
                                    y = s;
                                    z = t;
                                }
                            } else {
                                y = l;
                                z = g;
                            }
                            while (1) {
                                g = (y + 20) | 0;
                                l = c[g >> 2] | 0;
                                if (l) {
                                    y = l;
                                    z = g;
                                    continue;
                                }
                                g = (y + 16) | 0;
                                l = c[g >> 2] | 0;
                                if (!l) break;
                                else {
                                    y = l;
                                    z = g;
                                }
                            }
                            if (z >>> 0 < u >>> 0) le();
                            else {
                                c[z >> 2] = 0;
                                x = y;
                                break;
                            }
                        } else {
                            g = c[(a + (b + 8)) >> 2] | 0;
                            if (g >>> 0 < u >>> 0) le();
                            l = (g + 12) | 0;
                            if ((c[l >> 2] | 0) != (e | 0)) le();
                            t = (p + 8) | 0;
                            if ((c[t >> 2] | 0) == (e | 0)) {
                                c[l >> 2] = p;
                                c[t >> 2] = g;
                                x = p;
                                break;
                            } else le();
                        }
                    while (0);
                    if (m) {
                        p = c[(a + (b + 28)) >> 2] | 0;
                        j = (8984 + (p << 2)) | 0;
                        if ((e | 0) == (c[j >> 2] | 0)) {
                            c[j >> 2] = x;
                            if (!x) {
                                c[2171] = c[2171] & ~(1 << p);
                                break;
                            }
                        } else {
                            if (m >>> 0 < (c[2174] | 0) >>> 0) le();
                            p = (m + 16) | 0;
                            if ((c[p >> 2] | 0) == (e | 0)) c[p >> 2] = x;
                            else c[(m + 20) >> 2] = x;
                            if (!x) break;
                        }
                        p = c[2174] | 0;
                        if (x >>> 0 < p >>> 0) le();
                        c[(x + 24) >> 2] = m;
                        j = c[(a + (b + 16)) >> 2] | 0;
                        do
                            if (j)
                                if (j >>> 0 < p >>> 0) le();
                                else {
                                    c[(x + 16) >> 2] = j;
                                    c[(j + 24) >> 2] = x;
                                    break;
                                }
                        while (0);
                        j = c[(a + (b + 20)) >> 2] | 0;
                        if (j)
                            if (j >>> 0 < (c[2174] | 0) >>> 0) le();
                            else {
                                c[(x + 20) >> 2] = j;
                                c[(j + 24) >> 2] = x;
                                break;
                            }
                    }
                } else {
                    j = c[(a + (b + 8)) >> 2] | 0;
                    p = c[(a + (b + 12)) >> 2] | 0;
                    m = (8720 + ((f << 1) << 2)) | 0;
                    if ((j | 0) != (m | 0)) {
                        if (j >>> 0 < u >>> 0) le();
                        if ((c[(j + 12) >> 2] | 0) != (e | 0)) le();
                    }
                    if ((p | 0) == (j | 0)) {
                        c[2170] = c[2170] & ~(1 << f);
                        break;
                    }
                    if ((p | 0) != (m | 0)) {
                        if (p >>> 0 < u >>> 0) le();
                        m = (p + 8) | 0;
                        if ((c[m >> 2] | 0) == (e | 0)) A = m;
                        else le();
                    } else A = (p + 8) | 0;
                    c[(j + 12) >> 2] = p;
                    c[A >> 2] = j;
                }
            while (0);
            c[(n + 4) >> 2] = r | 1;
            c[(n + r) >> 2] = r;
            if ((n | 0) == (c[2175] | 0)) {
                c[2172] = r;
                i = d;
                return;
            } else B = r;
        } else {
            c[v >> 2] = w & -2;
            c[(n + 4) >> 2] = o | 1;
            c[(n + o) >> 2] = o;
            B = o;
        }
        o = B >>> 3;
        if (B >>> 0 < 256) {
            w = o << 1;
            v = (8720 + (w << 2)) | 0;
            r = c[2170] | 0;
            A = 1 << o;
            if (r & A) {
                o = (8720 + ((w + 2) << 2)) | 0;
                e = c[o >> 2] | 0;
                if (e >>> 0 < (c[2174] | 0) >>> 0) le();
                else {
                    C = o;
                    D = e;
                }
            } else {
                c[2170] = r | A;
                C = (8720 + ((w + 2) << 2)) | 0;
                D = v;
            }
            c[C >> 2] = n;
            c[(D + 12) >> 2] = n;
            c[(n + 8) >> 2] = D;
            c[(n + 12) >> 2] = v;
            i = d;
            return;
        }
        v = B >>> 8;
        if (v)
            if (B >>> 0 > 16777215) E = 31;
            else {
                D = (((v + 1048320) | 0) >>> 16) & 8;
                C = v << D;
                v = (((C + 520192) | 0) >>> 16) & 4;
                w = C << v;
                C = (((w + 245760) | 0) >>> 16) & 2;
                A = (14 - (v | D | C) + ((w << C) >>> 15)) | 0;
                E = ((B >>> ((A + 7) | 0)) & 1) | (A << 1);
            }
        else E = 0;
        A = (8984 + (E << 2)) | 0;
        c[(n + 28) >> 2] = E;
        c[(n + 20) >> 2] = 0;
        c[(n + 16) >> 2] = 0;
        C = c[2171] | 0;
        w = 1 << E;
        if (!(C & w)) {
            c[2171] = C | w;
            c[A >> 2] = n;
            c[(n + 24) >> 2] = A;
            c[(n + 12) >> 2] = n;
            c[(n + 8) >> 2] = n;
            i = d;
            return;
        }
        w = c[A >> 2] | 0;
        if ((E | 0) == 31) F = 0;
        else F = (25 - (E >>> 1)) | 0;
        a: do
            if (((c[(w + 4) >> 2] & -8) | 0) == (B | 0)) G = w;
            else {
                E = B << F;
                A = w;
                while (1) {
                    H = (A + ((E >>> 31) << 2) + 16) | 0;
                    C = c[H >> 2] | 0;
                    if (!C) break;
                    if (((c[(C + 4) >> 2] & -8) | 0) == (B | 0)) {
                        G = C;
                        break a;
                    } else {
                        E = E << 1;
                        A = C;
                    }
                }
                if (H >>> 0 < (c[2174] | 0) >>> 0) le();
                c[H >> 2] = n;
                c[(n + 24) >> 2] = A;
                c[(n + 12) >> 2] = n;
                c[(n + 8) >> 2] = n;
                i = d;
                return;
            }
        while (0);
        H = (G + 8) | 0;
        B = c[H >> 2] | 0;
        w = c[2174] | 0;
        if (!((G >>> 0 >= w >>> 0) & (B >>> 0 >= w >>> 0))) le();
        c[(B + 12) >> 2] = n;
        c[H >> 2] = n;
        c[(n + 8) >> 2] = B;
        c[(n + 12) >> 2] = G;
        c[(n + 24) >> 2] = 0;
        i = d;
        return;
    }
    function rk() {}
    function sk(b, d, e) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0;
        if ((e | 0) >= 4096) return eb(b | 0, d | 0, e | 0) | 0;
        f = b | 0;
        if ((b & 3) == (d & 3)) {
            while (b & 3) {
                if (!e) return f | 0;
                a[b >> 0] = a[d >> 0] | 0;
                b = (b + 1) | 0;
                d = (d + 1) | 0;
                e = (e - 1) | 0;
            }
            while ((e | 0) >= 4) {
                c[b >> 2] = c[d >> 2];
                b = (b + 4) | 0;
                d = (d + 4) | 0;
                e = (e - 4) | 0;
            }
        }
        while ((e | 0) > 0) {
            a[b >> 0] = a[d >> 0] | 0;
            b = (b + 1) | 0;
            d = (d + 1) | 0;
            e = (e - 1) | 0;
        }
        return f | 0;
    }
    function tk(b, d, e) {
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            i = 0;
        f = (b + e) | 0;
        if ((e | 0) >= 20) {
            d = d & 255;
            g = b & 3;
            h = d | (d << 8) | (d << 16) | (d << 24);
            i = f & ~3;
            if (g) {
                g = (b + 4 - g) | 0;
                while ((b | 0) < (g | 0)) {
                    a[b >> 0] = d;
                    b = (b + 1) | 0;
                }
            }
            while ((b | 0) < (i | 0)) {
                c[b >> 2] = h;
                b = (b + 4) | 0;
            }
        }
        while ((b | 0) < (f | 0)) {
            a[b >> 0] = d;
            b = (b + 1) | 0;
        }
        return (b - e) | 0;
    }
    function uk(b, c) {
        b = b | 0;
        c = c | 0;
        var d = 0;
        do {
            a[(b + d) >> 0] = a[(c + d) >> 0];
            d = (d + 1) | 0;
        } while (a[(c + (d - 1)) >> 0] | 0);
        return b | 0;
    }
    function vk(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0;
        e = (a + c) >>> 0;
        return ((E = (b + d + ((e >>> 0 < a >>> 0) | 0)) >>> 0), e | 0) | 0;
    }
    function wk(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        if ((c | 0) < 32) {
            E = b >>> c;
            return (a >>> c) | ((b & ((1 << c) - 1)) << (32 - c));
        }
        E = 0;
        return (b >>> (c - 32)) | 0;
    }
    function xk(b) {
        b = b | 0;
        var c = 0;
        c = b;
        while (a[c >> 0] | 0) c = (c + 1) | 0;
        return (c - b) | 0;
    }
    function yk(b, c, d) {
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0;
        if (((c | 0) < (b | 0)) & ((b | 0) < ((c + d) | 0))) {
            e = b;
            c = (c + d) | 0;
            b = (b + d) | 0;
            while ((d | 0) > 0) {
                b = (b - 1) | 0;
                c = (c - 1) | 0;
                d = (d - 1) | 0;
                a[b >> 0] = a[c >> 0] | 0;
            }
            b = e;
        } else sk(b, c, d) | 0;
        return b | 0;
    }
    function zk(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0;
        e = (b - d) >>> 0;
        e = (b - d - ((c >>> 0 > a >>> 0) | 0)) >>> 0;
        return ((E = e), ((a - c) >>> 0) | 0) | 0;
    }
    function Ak(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        if ((c | 0) < 32) {
            E = (b << c) | ((a & (((1 << c) - 1) << (32 - c))) >>> (32 - c));
            return a << c;
        }
        E = a << (c - 32);
        return 0;
    }
    function Bk(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        if ((c | 0) < 32) {
            E = b >> c;
            return (a >>> c) | ((b & ((1 << c) - 1)) << (32 - c));
        }
        E = (b | 0) < 0 ? -1 : 0;
        return (b >> (c - 32)) | 0;
    }
    function Ck(b) {
        b = b | 0;
        var c = 0;
        c = a[(n + (b >>> 24)) >> 0] | 0;
        if ((c | 0) < 8) return c | 0;
        c = a[(n + ((b >> 16) & 255)) >> 0] | 0;
        if ((c | 0) < 8) return (c + 8) | 0;
        c = a[(n + ((b >> 8) & 255)) >> 0] | 0;
        if ((c | 0) < 8) return (c + 16) | 0;
        return ((a[(n + (b & 255)) >> 0] | 0) + 24) | 0;
    }
    function Dk(b) {
        b = b | 0;
        var c = 0;
        c = a[(m + (b & 255)) >> 0] | 0;
        if ((c | 0) < 8) return c | 0;
        c = a[(m + ((b >> 8) & 255)) >> 0] | 0;
        if ((c | 0) < 8) return (c + 8) | 0;
        c = a[(m + ((b >> 16) & 255)) >> 0] | 0;
        if ((c | 0) < 8) return (c + 16) | 0;
        return ((a[(m + (b >>> 24)) >> 0] | 0) + 24) | 0;
    }
    function Ek(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0,
            d = 0,
            e = 0,
            f = 0;
        c = a & 65535;
        d = b & 65535;
        e = aa(d, c) | 0;
        f = a >>> 16;
        a = ((e >>> 16) + (aa(d, f) | 0)) | 0;
        d = b >>> 16;
        b = aa(d, c) | 0;
        return ((E = ((a >>> 16) + (aa(d, f) | 0) + ((((a & 65535) + b) | 0) >>> 16)) | 0), ((a + b) << 16) | (e & 65535) | 0) | 0;
    }
    function Fk(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            i = 0;
        e = (b >> 31) | (((b | 0) < 0 ? -1 : 0) << 1);
        f = (((b | 0) < 0 ? -1 : 0) >> 31) | (((b | 0) < 0 ? -1 : 0) << 1);
        g = (d >> 31) | (((d | 0) < 0 ? -1 : 0) << 1);
        h = (((d | 0) < 0 ? -1 : 0) >> 31) | (((d | 0) < 0 ? -1 : 0) << 1);
        i = zk(e ^ a, f ^ b, e, f) | 0;
        b = E;
        a = g ^ e;
        e = h ^ f;
        f = zk((Kk(i, b, zk(g ^ c, h ^ d, g, h) | 0, E, 0) | 0) ^ a, E ^ e, a, e) | 0;
        return f | 0;
    }
    function Gk(a, b, d, e) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0,
            h = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0;
        f = i;
        i = (i + 8) | 0;
        g = f | 0;
        h = (b >> 31) | (((b | 0) < 0 ? -1 : 0) << 1);
        j = (((b | 0) < 0 ? -1 : 0) >> 31) | (((b | 0) < 0 ? -1 : 0) << 1);
        k = (e >> 31) | (((e | 0) < 0 ? -1 : 0) << 1);
        l = (((e | 0) < 0 ? -1 : 0) >> 31) | (((e | 0) < 0 ? -1 : 0) << 1);
        m = zk(h ^ a, j ^ b, h, j) | 0;
        b = E;
        Kk(m, b, zk(k ^ d, l ^ e, k, l) | 0, E, g) | 0;
        l = zk(c[g >> 2] ^ h, c[(g + 4) >> 2] ^ j, h, j) | 0;
        j = E;
        i = f;
        return ((E = j), l) | 0;
    }
    function Hk(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0,
            f = 0;
        e = a;
        a = c;
        c = Ek(e, a) | 0;
        f = E;
        return ((E = ((aa(b, a) | 0) + (aa(d, e) | 0) + f) | (f & 0)), c | 0 | 0) | 0;
    }
    function Ik(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0;
        e = Kk(a, b, c, d, 0) | 0;
        return e | 0;
    }
    function Jk(a, b, d, e) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        var f = 0,
            g = 0;
        f = i;
        i = (i + 8) | 0;
        g = f | 0;
        Kk(a, b, d, e, g) | 0;
        i = f;
        return ((E = c[(g + 4) >> 2] | 0), c[g >> 2] | 0) | 0;
    }
    function Kk(a, b, d, e, f) {
        a = a | 0;
        b = b | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        var g = 0,
            h = 0,
            i = 0,
            j = 0,
            k = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0,
            q = 0,
            r = 0,
            s = 0,
            t = 0,
            u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0,
            z = 0,
            A = 0,
            B = 0,
            C = 0,
            D = 0,
            F = 0,
            G = 0,
            H = 0;
        g = a;
        h = b;
        i = h;
        j = d;
        k = e;
        l = k;
        if (!i) {
            m = (f | 0) != 0;
            if (!l) {
                if (m) {
                    c[f >> 2] = (g >>> 0) % (j >>> 0);
                    c[(f + 4) >> 2] = 0;
                }
                n = 0;
                o = ((g >>> 0) / (j >>> 0)) >>> 0;
                return ((E = n), o) | 0;
            } else {
                if (!m) {
                    n = 0;
                    o = 0;
                    return ((E = n), o) | 0;
                }
                c[f >> 2] = a | 0;
                c[(f + 4) >> 2] = b & 0;
                n = 0;
                o = 0;
                return ((E = n), o) | 0;
            }
        }
        m = (l | 0) == 0;
        do
            if (j) {
                if (!m) {
                    p = ((Ck(l | 0) | 0) - (Ck(i | 0) | 0)) | 0;
                    if (p >>> 0 <= 31) {
                        q = (p + 1) | 0;
                        r = (31 - p) | 0;
                        s = (p - 31) >> 31;
                        t = q;
                        u = ((g >>> (q >>> 0)) & s) | (i << r);
                        v = (i >>> (q >>> 0)) & s;
                        w = 0;
                        x = g << r;
                        break;
                    }
                    if (!f) {
                        n = 0;
                        o = 0;
                        return ((E = n), o) | 0;
                    }
                    c[f >> 2] = a | 0;
                    c[(f + 4) >> 2] = h | (b & 0);
                    n = 0;
                    o = 0;
                    return ((E = n), o) | 0;
                }
                r = (j - 1) | 0;
                if (r & j) {
                    s = ((Ck(j | 0) | 0) + 33 - (Ck(i | 0) | 0)) | 0;
                    q = (64 - s) | 0;
                    p = (32 - s) | 0;
                    y = p >> 31;
                    z = (s - 32) | 0;
                    A = z >> 31;
                    t = s;
                    u = (((p - 1) >> 31) & (i >>> (z >>> 0))) | (((i << p) | (g >>> (s >>> 0))) & A);
                    v = A & (i >>> (s >>> 0));
                    w = (g << q) & y;
                    x = (((i << q) | (g >>> (z >>> 0))) & y) | ((g << p) & ((s - 33) >> 31));
                    break;
                }
                if (f) {
                    c[f >> 2] = r & g;
                    c[(f + 4) >> 2] = 0;
                }
                if ((j | 0) == 1) {
                    n = h | (b & 0);
                    o = a | 0 | 0;
                    return ((E = n), o) | 0;
                } else {
                    r = Dk(j | 0) | 0;
                    n = (i >>> (r >>> 0)) | 0;
                    o = (i << (32 - r)) | (g >>> (r >>> 0)) | 0;
                    return ((E = n), o) | 0;
                }
            } else {
                if (m) {
                    if (f) {
                        c[f >> 2] = (i >>> 0) % (j >>> 0);
                        c[(f + 4) >> 2] = 0;
                    }
                    n = 0;
                    o = ((i >>> 0) / (j >>> 0)) >>> 0;
                    return ((E = n), o) | 0;
                }
                if (!g) {
                    if (f) {
                        c[f >> 2] = 0;
                        c[(f + 4) >> 2] = (i >>> 0) % (l >>> 0);
                    }
                    n = 0;
                    o = ((i >>> 0) / (l >>> 0)) >>> 0;
                    return ((E = n), o) | 0;
                }
                r = (l - 1) | 0;
                if (!(r & l)) {
                    if (f) {
                        c[f >> 2] = a | 0;
                        c[(f + 4) >> 2] = (r & i) | (b & 0);
                    }
                    n = 0;
                    o = i >>> ((Dk(l | 0) | 0) >>> 0);
                    return ((E = n), o) | 0;
                }
                r = ((Ck(l | 0) | 0) - (Ck(i | 0) | 0)) | 0;
                if (r >>> 0 <= 30) {
                    s = (r + 1) | 0;
                    p = (31 - r) | 0;
                    t = s;
                    u = (i << p) | (g >>> (s >>> 0));
                    v = i >>> (s >>> 0);
                    w = 0;
                    x = g << p;
                    break;
                }
                if (!f) {
                    n = 0;
                    o = 0;
                    return ((E = n), o) | 0;
                }
                c[f >> 2] = a | 0;
                c[(f + 4) >> 2] = h | (b & 0);
                n = 0;
                o = 0;
                return ((E = n), o) | 0;
            }
        while (0);
        if (!t) {
            B = x;
            C = w;
            D = v;
            F = u;
            G = 0;
            H = 0;
        } else {
            b = d | 0 | 0;
            d = k | (e & 0);
            e = vk(b, d, -1, -1) | 0;
            k = E;
            h = x;
            x = w;
            w = v;
            v = u;
            u = t;
            t = 0;
            do {
                a = h;
                h = (x >>> 31) | (h << 1);
                x = t | (x << 1);
                g = (v << 1) | (a >>> 31) | 0;
                a = (v >>> 31) | (w << 1) | 0;
                zk(e, k, g, a) | 0;
                i = E;
                l = (i >> 31) | (((i | 0) < 0 ? -1 : 0) << 1);
                t = l & 1;
                v = zk(g, a, l & b, ((((i | 0) < 0 ? -1 : 0) >> 31) | (((i | 0) < 0 ? -1 : 0) << 1)) & d) | 0;
                w = E;
                u = (u - 1) | 0;
            } while ((u | 0) != 0);
            B = h;
            C = x;
            D = w;
            F = v;
            G = 0;
            H = t;
        }
        t = C;
        C = 0;
        if (f) {
            c[f >> 2] = F;
            c[(f + 4) >> 2] = D;
        }
        n = ((t | 0) >>> 31) | ((B | C) << 1) | (((C << 1) | (t >>> 31)) & 0) | G;
        o = (((t << 1) | (0 >>> 31)) & -2) | H;
        return ((E = n), o) | 0;
    }
    function Lk(a, b, c, d, e, f) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        Sf[a & 7](b | 0, c | 0, d | 0, e | 0, f | 0);
    }
    function Mk(a, b) {
        a = a | 0;
        b = +b;
        Tf[a & 3](+b);
    }
    function Nk(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = +c;
        Uf[a & 3](b | 0, +c);
    }
    function Ok(a, b) {
        a = a | 0;
        b = b | 0;
        Vf[a & 63](b | 0);
    }
    function Pk(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Wf[a & 63](b | 0, c | 0);
    }
    function Qk(a, b) {
        a = a | 0;
        b = b | 0;
        return Xf[a & 63](b | 0) | 0;
    }
    function Rk(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = +c;
        d = +d;
        e = +e;
        Yf[a & 3](b | 0, +c, +d, +e);
    }
    function Sk(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = +c;
        d = +d;
        Zf[a & 3](b | 0, +c, +d);
    }
    function Tk(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        return _f[a & 7](b | 0, c | 0, d | 0) | 0;
    }
    function Uk(a, b, c, d, e, f, g, h, i) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        i = i | 0;
        $f[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0, i | 0);
    }
    function Vk(a, b, c, d, e, f, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        ag[a & 7](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0);
    }
    function Wk(a, b, c) {
        a = a | 0;
        b = +b;
        c = +c;
        bg[a & 3](+b, +c);
    }
    function Xk(a, b, c, d, e, f) {
        a = a | 0;
        b = b | 0;
        c = +c;
        d = +d;
        e = +e;
        f = +f;
        cg[a & 3](b | 0, +c, +d, +e, +f);
    }
    function Yk(a, b, c) {
        a = a | 0;
        b = +b;
        c = c | 0;
        dg[a & 1](+b, c | 0);
    }
    function Zk(a, b, c, d, e, f, g, h) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        eg[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0);
    }
    function _k(a, b, c, d, e, f, g, h, i, j) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        i = i | 0;
        j = j | 0;
        fg[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0, i | 0, j | 0);
    }
    function $k(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        return gg[a & 31](b | 0, c | 0) | 0;
    }
    function al(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        return +hg[a & 1](b | 0, c | 0, d | 0);
    }
    function bl(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        return +ig[a & 3](b | 0, c | 0);
    }
    function cl(a) {
        a = a | 0;
        return jg[a & 7]() | 0;
    }
    function dl(a, b, c, d, e, f, g) {
        a = a | 0;
        b = +b;
        c = +c;
        d = +d;
        e = +e;
        f = +f;
        g = +g;
        kg[a & 1](+b, +c, +d, +e, +f, +g);
    }
    function el(a, b, c, d, e) {
        a = a | 0;
        b = +b;
        c = +c;
        d = +d;
        e = +e;
        lg[a & 3](+b, +c, +d, +e);
    }
    function fl(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        mg[a & 63](b | 0, c | 0, d | 0);
    }
    function gl(a) {
        a = a | 0;
        ng[a & 7]();
    }
    function hl(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = +d;
        og[a & 3](b | 0, c | 0, +d);
    }
    function il(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        pg[a & 31](b | 0, c | 0, d | 0, e | 0);
    }
    function jl(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        ba(0);
    }
    function kl(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        gd(a | 0, b | 0, c | 0, d | 0, e | 0);
    }
    function ll(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        ge(a | 0, b | 0, c | 0, d | 0, e | 0);
    }
    function ml(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        cc(a | 0, b | 0, c | 0, d | 0, e | 0);
    }
    function nl(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        kc(a | 0, b | 0, c | 0, d | 0, e | 0);
    }
    function ol(a) {
        a = +a;
        ba(1);
    }
    function pl(a) {
        a = +a;
        Tc(+a);
    }
    function ql(a) {
        a = +a;
        vc(+a);
    }
    function rl(a) {
        a = +a;
        pb(+a);
    }
    function sl(a, b) {
        a = a | 0;
        b = +b;
        ba(2);
    }
    function tl(a, b) {
        a = a | 0;
        b = +b;
        ve(a | 0, +b);
    }
    function ul(a, b) {
        a = a | 0;
        b = +b;
        Nb(a | 0, +b);
    }
    function vl(a) {
        a = a | 0;
        ba(3);
    }
    function wl(a) {
        a = a | 0;
        Dc(a | 0);
    }
    function xl(a) {
        a = a | 0;
        Ue(a | 0);
    }
    function yl(a) {
        a = a | 0;
        ee(a | 0);
    }
    function zl(a) {
        a = a | 0;
        df(a | 0);
    }
    function Al(a) {
        a = a | 0;
        Wa(a | 0);
    }
    function Bl(a) {
        a = a | 0;
        Gf(a | 0);
    }
    function Cl(a) {
        a = a | 0;
        mf(a | 0);
    }
    function Dl(a) {
        a = a | 0;
        Nf(a | 0);
    }
    function El(a) {
        a = a | 0;
        nc(a | 0);
    }
    function Fl(a) {
        a = a | 0;
        kf(a | 0);
    }
    function Gl(a) {
        a = a | 0;
        ad(a | 0);
    }
    function Hl(a) {
        a = a | 0;
        Xc(a | 0);
    }
    function Il(a) {
        a = a | 0;
        Cd(a | 0);
    }
    function Jl(a) {
        a = a | 0;
        bb(a | 0);
    }
    function Kl(a) {
        a = a | 0;
        Ya(a | 0);
    }
    function Ll(a) {
        a = a | 0;
        Sc(a | 0);
    }
    function Ml(a) {
        a = a | 0;
        Ed(a | 0);
    }
    function Nl(a) {
        a = a | 0;
        Pa(a | 0);
    }
    function Ol(a) {
        a = a | 0;
        Na(a | 0);
    }
    function Pl(a) {
        a = a | 0;
        pd(a | 0);
    }
    function Ql(a) {
        a = a | 0;
        Hc(a | 0);
    }
    function Rl(a) {
        a = a | 0;
        be(a | 0);
    }
    function Sl(a) {
        a = a | 0;
        td(a | 0);
    }
    function Tl(a) {
        a = a | 0;
        ab(a | 0);
    }
    function Ul(a) {
        a = a | 0;
        nf(a | 0);
    }
    function Vl(a) {
        a = a | 0;
        ef(a | 0);
    }
    function Wl(a, b) {
        a = a | 0;
        b = b | 0;
        ba(4);
    }
    function Xl(a, b) {
        a = a | 0;
        b = b | 0;
        Od(a | 0, b | 0);
    }
    function Yl(a, b) {
        a = a | 0;
        b = b | 0;
        Ma(a | 0, b | 0);
    }
    function Zl(a, b) {
        a = a | 0;
        b = b | 0;
        Kf(a | 0, b | 0);
    }
    function _l(a, b) {
        a = a | 0;
        b = b | 0;
        mb(a | 0, b | 0);
    }
    function $l(a, b) {
        a = a | 0;
        b = b | 0;
        Zb(a | 0, b | 0);
    }
    function am(a, b) {
        a = a | 0;
        b = b | 0;
        He(a | 0, b | 0);
    }
    function bm(a, b) {
        a = a | 0;
        b = b | 0;
        Pf(a | 0, b | 0);
    }
    function cm(a, b) {
        a = a | 0;
        b = b | 0;
        sb(a | 0, b | 0);
    }
    function dm(a, b) {
        a = a | 0;
        b = b | 0;
        pf(a | 0, b | 0);
    }
    function em(a, b) {
        a = a | 0;
        b = b | 0;
        Fa(a | 0, b | 0);
    }
    function fm(a, b) {
        a = a | 0;
        b = b | 0;
        Hd(a | 0, b | 0);
    }
    function gm(a, b) {
        a = a | 0;
        b = b | 0;
        Zc(a | 0, b | 0);
    }
    function hm(a, b) {
        a = a | 0;
        b = b | 0;
        qb(a | 0, b | 0);
    }
    function im(a, b) {
        a = a | 0;
        b = b | 0;
        cf(a | 0, b | 0);
    }
    function jm(a, b) {
        a = a | 0;
        b = b | 0;
        sf(a | 0, b | 0);
    }
    function km(a, b) {
        a = a | 0;
        b = b | 0;
        fc(a | 0, b | 0);
    }
    function lm(a, b) {
        a = a | 0;
        b = b | 0;
        Qa(a | 0, b | 0);
    }
    function mm(a, b) {
        a = a | 0;
        b = b | 0;
        Gb(a | 0, b | 0);
    }
    function nm(a, b) {
        a = a | 0;
        b = b | 0;
        Qb(a | 0, b | 0);
    }
    function om(a, b) {
        a = a | 0;
        b = b | 0;
        Lf(a | 0, b | 0);
    }
    function pm(a, b) {
        a = a | 0;
        b = b | 0;
        Wc(a | 0, b | 0);
    }
    function qm(a, b) {
        a = a | 0;
        b = b | 0;
        se(a | 0, b | 0);
    }
    function rm(a, b) {
        a = a | 0;
        b = b | 0;
        xf(a | 0, b | 0);
    }
    function sm(a, b) {
        a = a | 0;
        b = b | 0;
        Jb(a | 0, b | 0);
    }
    function tm(a, b) {
        a = a | 0;
        b = b | 0;
        ue(a | 0, b | 0);
    }
    function um(a, b) {
        a = a | 0;
        b = b | 0;
        ec(a | 0, b | 0);
    }
    function vm(a, b) {
        a = a | 0;
        b = b | 0;
        Ad(a | 0, b | 0);
    }
    function wm(a, b) {
        a = a | 0;
        b = b | 0;
        Ke(a | 0, b | 0);
    }
    function xm(a, b) {
        a = a | 0;
        b = b | 0;
        rd(a | 0, b | 0);
    }
    function ym(a, b) {
        a = a | 0;
        b = b | 0;
        lb(a | 0, b | 0);
    }
    function zm(a, b) {
        a = a | 0;
        b = b | 0;
        Ob(a | 0, b | 0);
    }
    function Am(a, b) {
        a = a | 0;
        b = b | 0;
        Pc(a | 0, b | 0);
    }
    function Bm(a, b) {
        a = a | 0;
        b = b | 0;
        ce(a | 0, b | 0);
    }
    function Cm(a) {
        a = a | 0;
        ba(5);
        return 0;
    }
    function Dm(a) {
        a = a | 0;
        return Bb(a | 0) | 0;
    }
    function Em(a) {
        a = a | 0;
        return gf(a | 0) | 0;
    }
    function Fm(a) {
        a = a | 0;
        return Mb(a | 0) | 0;
    }
    function Gm(a) {
        a = a | 0;
        return ye(a | 0) | 0;
    }
    function Hm(a) {
        a = a | 0;
        return Md(a | 0) | 0;
    }
    function Im(a) {
        a = a | 0;
        return vf(a | 0) | 0;
    }
    function Jm(a) {
        a = a | 0;
        return wb(a | 0) | 0;
    }
    function Km(a) {
        a = a | 0;
        return Cb(a | 0) | 0;
    }
    function Lm(a) {
        a = a | 0;
        return tc(a | 0) | 0;
    }
    function Mm(a) {
        a = a | 0;
        return Eb(a | 0) | 0;
    }
    function Nm(a, b, c, d) {
        a = a | 0;
        b = +b;
        c = +c;
        d = +d;
        ba(6);
    }
    function Om(a, b, c, d) {
        a = a | 0;
        b = +b;
        c = +c;
        d = +d;
        zc(a | 0, +b, +c, +d);
    }
    function Pm(a, b, c, d) {
        a = a | 0;
        b = +b;
        c = +c;
        d = +d;
        Ie(a | 0, +b, +c, +d);
    }
    function Qm(a, b, c) {
        a = a | 0;
        b = +b;
        c = +c;
        ba(7);
    }
    function Rm(a, b, c) {
        a = a | 0;
        b = +b;
        c = +c;
        Tb(a | 0, +b, +c);
    }
    function Sm(a, b, c) {
        a = a | 0;
        b = +b;
        c = +c;
        oc(a | 0, +b, +c);
    }
    function Tm(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        ba(8);
        return 0;
    }
    function Um(a, b, c, d, e, f, g, h) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        ba(9);
    }
    function Vm(a, b, c, d, e, f, g, h) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        Za(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0);
    }
    function Wm(a, b, c, d, e, f, g, h) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        fe(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0);
    }
    function Xm(a, b, c, d, e, f, g, h) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        Fe(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0);
    }
    function Ym(a, b, c, d, e, f) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        ba(10);
    }
    function Zm(a, b, c, d, e, f) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        Rb(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0);
    }
    function _m(a, b, c, d, e, f) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        vb(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0);
    }
    function $m(a, b) {
        a = +a;
        b = +b;
        ba(11);
    }
    function an(a, b) {
        a = +a;
        b = +b;
        $b(+a, +b);
    }
    function bn(a, b) {
        a = +a;
        b = +b;
        Ze(+a, +b);
    }
    function cn(a, b) {
        a = +a;
        b = +b;
        sc(+a, +b);
    }
    function dn(a, b, c, d, e) {
        a = a | 0;
        b = +b;
        c = +c;
        d = +d;
        e = +e;
        ba(12);
    }
    function en(a, b, c, d, e) {
        a = a | 0;
        b = +b;
        c = +c;
        d = +d;
        e = +e;
        kd(a | 0, +b, +c, +d, +e);
    }
    function fn(a, b, c, d, e) {
        a = a | 0;
        b = +b;
        c = +c;
        d = +d;
        e = +e;
        Kd(a | 0, +b, +c, +d, +e);
    }
    function gn(a, b) {
        a = +a;
        b = b | 0;
        ba(13);
    }
    function hn(a, b) {
        a = +a;
        b = b | 0;
        Ye(+a, b | 0);
    }
    function jn(a, b, c, d, e, f, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        ba(14);
    }
    function kn(a, b, c, d, e, f, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        Ec(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0, g | 0);
    }
    function ln(a, b, c, d, e, f, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        Bd(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0, g | 0);
    }
    function mn(a, b, c, d, e, f, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        Pb(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0, g | 0);
    }
    function nn(a, b, c, d, e, f, g, h, i) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        i = i | 0;
        ba(15);
    }
    function on(a, b, c, d, e, f, g, h, i) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        i = i | 0;
        Sb(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0, i | 0);
    }
    function pn(a, b, c, d, e, f, g, h, i) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        i = i | 0;
        Qf(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0, i | 0);
    }
    function qn(a, b, c, d, e, f, g, h, i) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        h = h | 0;
        i = i | 0;
        Le(a | 0, b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0, i | 0);
    }
    function rn(a, b) {
        a = a | 0;
        b = b | 0;
        ba(16);
        return 0;
    }
    function sn(a, b) {
        a = a | 0;
        b = b | 0;
        return Jc(a | 0, b | 0) | 0;
    }
    function tn(a, b) {
        a = a | 0;
        b = b | 0;
        return Mc(a | 0, b | 0) | 0;
    }
    function un(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        ba(17);
        return 0.0;
    }
    function vn(a, b) {
        a = a | 0;
        b = b | 0;
        ba(18);
        return 0.0;
    }
    function wn() {
        ba(19);
        return 0;
    }
    function xn() {
        return Ff() | 0;
    }
    function yn() {
        return uc() | 0;
    }
    function zn(a, b, c, d, e, f) {
        a = +a;
        b = +b;
        c = +c;
        d = +d;
        e = +e;
        f = +f;
        ba(20);
    }
    function An(a, b, c, d, e, f) {
        a = +a;
        b = +b;
        c = +c;
        d = +d;
        e = +e;
        f = +f;
        Xe(+a, +b, +c, +d, +e, +f);
    }
    function Bn(a, b, c, d) {
        a = +a;
        b = +b;
        c = +c;
        d = +d;
        ba(21);
    }
    function Cn(a, b, c, d) {
        a = +a;
        b = +b;
        c = +c;
        d = +d;
        oe(+a, +b, +c, +d);
    }
    function Dn(a, b, c, d) {
        a = +a;
        b = +b;
        c = +c;
        d = +d;
        Df(+a, +b, +c, +d);
    }
    function En(a, b, c, d) {
        a = +a;
        b = +b;
        c = +c;
        d = +d;
        Fc(+a, +b, +c, +d);
    }
    function Fn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        ba(22);
    }
    function Gn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Ea(a | 0, b | 0, c | 0);
    }
    function Hn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        ic(a | 0, b | 0, c | 0);
    }
    function In(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Ub(a | 0, b | 0, c | 0);
    }
    function Jn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Hb(a | 0, b | 0, c | 0);
    }
    function Kn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Fd(a | 0, b | 0, c | 0);
    }
    function Ln(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Oe(a | 0, b | 0, c | 0);
    }
    function Mn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Me(a | 0, b | 0, c | 0);
    }
    function Nn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        me(a | 0, b | 0, c | 0);
    }
    function On(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Ne(a | 0, b | 0, c | 0);
    }
    function Pn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Ld(a | 0, b | 0, c | 0);
    }
    function Qn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        vd(a | 0, b | 0, c | 0);
    }
    function Rn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        yd(a | 0, b | 0, c | 0);
    }
    function Sn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        ud(a | 0, b | 0, c | 0);
    }
    function Tn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Dd(a | 0, b | 0, c | 0);
    }
    function Un(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        cb(a | 0, b | 0, c | 0);
    }
    function Vn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        hc(a | 0, b | 0, c | 0);
    }
    function Wn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        xe(a | 0, b | 0, c | 0);
    }
    function Xn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        If(a | 0, b | 0, c | 0);
    }
    function Yn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Ta(a | 0, b | 0, c | 0);
    }
    function Zn(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        yf(a | 0, b | 0, c | 0);
    }
    function _n(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        pe(a | 0, b | 0, c | 0);
    }
    function $n(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Nd(a | 0, b | 0, c | 0);
    }
    function ao(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        lc(a | 0, b | 0, c | 0);
    }
    function bo(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        hd(a | 0, b | 0, c | 0);
    }
    function co(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Oc(a | 0, b | 0, c | 0);
    }
    function eo(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Sa(a | 0, b | 0, c | 0);
    }
    function fo(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        Ce(a | 0, b | 0, c | 0);
    }
    function go(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        ke(a | 0, b | 0, c | 0);
    }
    function ho(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        af(a | 0, b | 0, c | 0);
    }
    function io() {
        ba(23);
    }
    function jo() {
        id();
    }
    function ko() {
        Ia();
    }
    function lo() {
        Se();
    }
    function mo() {
        rc();
    }
    function no(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = +c;
        ba(24);
    }
    function oo(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = +c;
        Xb(a | 0, b | 0, +c);
    }
    function po(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        ba(25);
    }
    function qo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        gc(a | 0, b | 0, c | 0, d | 0);
    }
    function ro(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        rf(a | 0, b | 0, c | 0, d | 0);
    }
    function so(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Ac(a | 0, b | 0, c | 0, d | 0);
    }
    function to(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Vb(a | 0, b | 0, c | 0, d | 0);
    }
    function uo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Sd(a | 0, b | 0, c | 0, d | 0);
    }
    function vo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        te(a | 0, b | 0, c | 0, d | 0);
    }
    function wo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Yb(a | 0, b | 0, c | 0, d | 0);
    }
    function xo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Ae(a | 0, b | 0, c | 0, d | 0);
    }
    function yo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Ef(a | 0, b | 0, c | 0, d | 0);
    }
    function zo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        sd(a | 0, b | 0, c | 0, d | 0);
    }
    function Ao(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Ka(a | 0, b | 0, c | 0, d | 0);
    }
    function Bo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        wf(a | 0, b | 0, c | 0, d | 0);
    }
    function Co(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        he(a | 0, b | 0, c | 0, d | 0);
    }
    function Do(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        dd(a | 0, b | 0, c | 0, d | 0);
    }
    function Eo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Te(a | 0, b | 0, c | 0, d | 0);
    }
    function Fo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        kb(a | 0, b | 0, c | 0, d | 0);
    }
    function Go(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Rc(a | 0, b | 0, c | 0, d | 0);
    }
    function Ho(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Td(a | 0, b | 0, c | 0, d | 0);
    }
    function Io(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        mc(a | 0, b | 0, c | 0, d | 0);
    }
    function Jo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        _b(a | 0, b | 0, c | 0, d | 0);
    }
    function Ko(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Zd(a | 0, b | 0, c | 0, d | 0);
    }
    function Lo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Fb(a | 0, b | 0, c | 0, d | 0);
    }
    function Mo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Mf(a | 0, b | 0, c | 0, d | 0);
    }
    function No(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        $d(a | 0, b | 0, c | 0, d | 0);
    }
    function Oo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Ja(a | 0, b | 0, c | 0, d | 0);
    }
    function Po(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Ee(a | 0, b | 0, c | 0, d | 0);
    }
    function Qo(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        Kb(a | 0, b | 0, c | 0, d | 0);
    }

    // EMSCRIPTEN_END_FUNCS
    var Sf = [jl, Zj, Yj, Vj, kl, ll, ml, nl];
    var Tf = [ol, pl, ql, rl];
    var Uf = [sl, tl, ul, sl];
    var Vf = [
        vl,
        yj,
        xj,
        Dj,
        Hj,
        Ej,
        Fj,
        Kj,
        Gj,
        Ij,
        Jj,
        Xh,
        _h,
        gi,
        li,
        oi,
        ti,
        wi,
        Og,
        Kg,
        Mi,
        Ih,
        Ui,
        Mh,
        Lh,
        kk,
        fk,
        wl,
        xl,
        yl,
        zl,
        Al,
        Bl,
        Cl,
        Dl,
        El,
        Fl,
        Gl,
        Hl,
        Il,
        Jl,
        Kl,
        Ll,
        Ml,
        Nl,
        Ol,
        Pl,
        Ql,
        Rl,
        Sl,
        Tl,
        Ul,
        Vl,
        vl,
        vl,
        vl,
        vl,
        vl,
        vl,
        vl,
        vl,
        vl,
        vl,
        vl,
    ];
    var Wf = [
        Wl,
        ui,
        Di,
        Dg,
        Ng,
        Ig,
        Pi,
        Xi,
        Ph,
        fj,
        Xl,
        Yl,
        Zl,
        _l,
        $l,
        am,
        bm,
        cm,
        dm,
        em,
        fm,
        gm,
        hm,
        im,
        jm,
        km,
        lm,
        mm,
        nm,
        om,
        pm,
        qm,
        rm,
        sm,
        tm,
        um,
        vm,
        wm,
        xm,
        ym,
        zm,
        Am,
        Bm,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
        Wl,
    ];
    var Xf = [
        Cm,
        zj,
        Zh,
        fi,
        kh,
        ii,
        ni,
        pi,
        vi,
        Bi,
        Ji,
        Hg,
        Li,
        Oi,
        Qi,
        Jh,
        Ti,
        Wi,
        Oh,
        $i,
        aj,
        bj,
        dj,
        ej,
        Dm,
        Em,
        Fm,
        Gm,
        Hm,
        Im,
        Jm,
        Km,
        Lm,
        Mm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
        Cm,
    ];
    var Yf = [Nm, Om, Pm, Nm];
    var Zf = [Qm, Rm, Sm, Qm];
    var _f = [Tm, Mj, Sj, Lj, ei, si, Ei, Gi];
    var $f = [Um, Vm, Wm, Xm];
    var ag = [Ym, ak, $j, _j, Zm, _m, Ym, Ym];
    var bg = [$m, an, bn, cn];
    var cg = [dn, en, fn, dn];
    var dg = [gn, hn];
    var eg = [jn, kn, ln, mn];
    var fg = [nn, on, pn, qn];
    var gg = [rn, $h, bi, di, hi, ji, qi, zi, Ci, Gg, Fi, Ki, Ni, Ri, Si, Vi, Zi, _i, cj, gj, sn, tn, rn, rn, rn, rn, rn, rn, rn, rn, rn, rn];
    var hg = [un, Yi];
    var ig = [vn, xi, Nh, ij];
    var jg = [wn, Wh, ki, Rh, Sh, Th, xn, yn];
    var kg = [zn, An];
    var lg = [Bn, Cn, Dn, En];
    var mg = [
        Fn,
        ai,
        ci,
        ri,
        Ai,
        Eg,
        Hi,
        Ii,
        hj,
        Gn,
        Hn,
        In,
        Jn,
        Kn,
        Ln,
        Mn,
        Nn,
        On,
        Pn,
        Qn,
        Rn,
        Sn,
        Tn,
        Un,
        Vn,
        Wn,
        Xn,
        Yn,
        Zn,
        _n,
        $n,
        ao,
        bo,
        co,
        eo,
        fo,
        go,
        ho,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
        Fn,
    ];
    var ng = [io, dk, ek, jo, ko, lo, mo, io];
    var og = [no, yi, jj, oo];
    var pg = [po, Oj, Pj, Rj, qo, ro, so, to, uo, vo, wo, xo, yo, zo, Ao, Bo, Co, Do, Eo, Fo, Go, Ho, Io, Jo, Ko, Lo, Mo, No, Oo, Po, Qo, po];
    return {
        ___cxa_can_catch: bk,
        _free: ik,
        ___cxa_is_pointer_type: ck,
        _i64Add: vk,
        _memmove: yk,
        _strstr: qj,
        _realloc: jk,
        _strlen: xk,
        _memset: tk,
        _malloc: hk,
        _memcpy: sk,
        ___getTypeName: kj,
        _bitshift64Lshr: wk,
        _emscripten_GetProcAddress: gk,
        _strcpy: uk,
        __GLOBAL__I_a: Vh,
        __GLOBAL__I_a327: mj,
        runPostSets: rk,
        stackAlloc: qg,
        stackSave: rg,
        stackRestore: sg,
        setThrew: tg,
        setTempRet0: wg,
        getTempRet0: xg,
        dynCall_viiiii: Lk,
        dynCall_vd: Mk,
        dynCall_vid: Nk,
        dynCall_vi: Ok,
        dynCall_vii: Pk,
        dynCall_ii: Qk,
        dynCall_viddd: Rk,
        dynCall_vidd: Sk,
        dynCall_iiii: Tk,
        dynCall_viiiiiiii: Uk,
        dynCall_viiiiii: Vk,
        dynCall_vdd: Wk,
        dynCall_vidddd: Xk,
        dynCall_vdi: Yk,
        dynCall_viiiiiii: Zk,
        dynCall_viiiiiiiii: _k,
        dynCall_iii: $k,
        dynCall_diii: al,
        dynCall_dii: bl,
        dynCall_i: cl,
        dynCall_vdddddd: dl,
        dynCall_vdddd: el,
        dynCall_viii: fl,
        dynCall_v: gl,
        dynCall_viid: hl,
        dynCall_viiii: il,
    };
})(
    // EMSCRIPTEN_END_ASM
    Module.asmGlobalArg,
    Module.asmLibraryArg,
    buffer
);
var ___cxa_can_catch = (Module["___cxa_can_catch"] = asm["___cxa_can_catch"]);
var _free = (Module["_free"] = asm["_free"]);
var ___cxa_is_pointer_type = (Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"]);
var _i64Add = (Module["_i64Add"] = asm["_i64Add"]);
var _memmove = (Module["_memmove"] = asm["_memmove"]);
var _strstr = (Module["_strstr"] = asm["_strstr"]);
var _realloc = (Module["_realloc"] = asm["_realloc"]);
var _strlen = (Module["_strlen"] = asm["_strlen"]);
var _memset = (Module["_memset"] = asm["_memset"]);
var _malloc = (Module["_malloc"] = asm["_malloc"]);
var _memcpy = (Module["_memcpy"] = asm["_memcpy"]);
var ___getTypeName = (Module["___getTypeName"] = asm["___getTypeName"]);
var _bitshift64Lshr = (Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"]);
var _emscripten_GetProcAddress = (Module["_emscripten_GetProcAddress"] = asm["_emscripten_GetProcAddress"]);
var _strcpy = (Module["_strcpy"] = asm["_strcpy"]);
var __GLOBAL__I_a = (Module["__GLOBAL__I_a"] = asm["__GLOBAL__I_a"]);
var __GLOBAL__I_a327 = (Module["__GLOBAL__I_a327"] = asm["__GLOBAL__I_a327"]);
var runPostSets = (Module["runPostSets"] = asm["runPostSets"]);
var dynCall_viiiii = (Module["dynCall_viiiii"] = asm["dynCall_viiiii"]);
var dynCall_vd = (Module["dynCall_vd"] = asm["dynCall_vd"]);
var dynCall_vid = (Module["dynCall_vid"] = asm["dynCall_vid"]);
var dynCall_vi = (Module["dynCall_vi"] = asm["dynCall_vi"]);
var dynCall_vii = (Module["dynCall_vii"] = asm["dynCall_vii"]);
var dynCall_ii = (Module["dynCall_ii"] = asm["dynCall_ii"]);
var dynCall_viddd = (Module["dynCall_viddd"] = asm["dynCall_viddd"]);
var dynCall_vidd = (Module["dynCall_vidd"] = asm["dynCall_vidd"]);
var dynCall_iiii = (Module["dynCall_iiii"] = asm["dynCall_iiii"]);
var dynCall_viiiiiiii = (Module["dynCall_viiiiiiii"] = asm["dynCall_viiiiiiii"]);
var dynCall_viiiiii = (Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"]);
var dynCall_vdd = (Module["dynCall_vdd"] = asm["dynCall_vdd"]);
var dynCall_vidddd = (Module["dynCall_vidddd"] = asm["dynCall_vidddd"]);
var dynCall_vdi = (Module["dynCall_vdi"] = asm["dynCall_vdi"]);
var dynCall_viiiiiii = (Module["dynCall_viiiiiii"] = asm["dynCall_viiiiiii"]);
var dynCall_viiiiiiiii = (Module["dynCall_viiiiiiiii"] = asm["dynCall_viiiiiiiii"]);
var dynCall_iii = (Module["dynCall_iii"] = asm["dynCall_iii"]);
var dynCall_diii = (Module["dynCall_diii"] = asm["dynCall_diii"]);
var dynCall_dii = (Module["dynCall_dii"] = asm["dynCall_dii"]);
var dynCall_i = (Module["dynCall_i"] = asm["dynCall_i"]);
var dynCall_vdddddd = (Module["dynCall_vdddddd"] = asm["dynCall_vdddddd"]);
var dynCall_vdddd = (Module["dynCall_vdddd"] = asm["dynCall_vdddd"]);
var dynCall_viii = (Module["dynCall_viii"] = asm["dynCall_viii"]);
var dynCall_v = (Module["dynCall_v"] = asm["dynCall_v"]);
var dynCall_viid = (Module["dynCall_viid"] = asm["dynCall_viid"]);
var dynCall_viiii = (Module["dynCall_viiii"] = asm["dynCall_viiii"]);
Runtime.stackAlloc = asm["stackAlloc"];
Runtime.stackSave = asm["stackSave"];
Runtime.stackRestore = asm["stackRestore"];
Runtime.setTempRet0 = asm["setTempRet0"];
Runtime.getTempRet0 = asm["getTempRet0"];
var i64Math = (function () {
    var goog = { math: {} };
    goog.math.Long = function (low, high) {
        this.low_ = low | 0;
        this.high_ = high | 0;
    };
    goog.math.Long.IntCache_ = {};
    goog.math.Long.fromInt = function (value) {
        if (-128 <= value && value < 128) {
            var cachedObj = goog.math.Long.IntCache_[value];
            if (cachedObj) {
                return cachedObj;
            }
        }
        var obj = new goog.math.Long(value | 0, value < 0 ? -1 : 0);
        if (-128 <= value && value < 128) {
            goog.math.Long.IntCache_[value] = obj;
        }
        return obj;
    };
    goog.math.Long.fromNumber = function (value) {
        if (isNaN(value) || !isFinite(value)) {
            return goog.math.Long.ZERO;
        } else if (value <= -goog.math.Long.TWO_PWR_63_DBL_) {
            return goog.math.Long.MIN_VALUE;
        } else if (value + 1 >= goog.math.Long.TWO_PWR_63_DBL_) {
            return goog.math.Long.MAX_VALUE;
        } else if (value < 0) {
            return goog.math.Long.fromNumber(-value).negate();
        } else {
            return new goog.math.Long(value % goog.math.Long.TWO_PWR_32_DBL_ | 0, (value / goog.math.Long.TWO_PWR_32_DBL_) | 0);
        }
    };
    goog.math.Long.fromBits = function (lowBits, highBits) {
        return new goog.math.Long(lowBits, highBits);
    };
    goog.math.Long.fromString = function (str, opt_radix) {
        if (str.length == 0) {
            throw Error("number format error: empty string");
        }
        var radix = opt_radix || 10;
        if (radix < 2 || 36 < radix) {
            throw Error("radix out of range: " + radix);
        }
        if (str.charAt(0) == "-") {
            return goog.math.Long.fromString(str.substring(1), radix).negate();
        } else if (str.indexOf("-") >= 0) {
            throw Error('number format error: interior "-" character: ' + str);
        }
        var radixToPower = goog.math.Long.fromNumber(Math.pow(radix, 8));
        var result = goog.math.Long.ZERO;
        for (var i = 0; i < str.length; i += 8) {
            var size = Math.min(8, str.length - i);
            var value = parseInt(str.substring(i, i + size), radix);
            if (size < 8) {
                var power = goog.math.Long.fromNumber(Math.pow(radix, size));
                result = result.multiply(power).add(goog.math.Long.fromNumber(value));
            } else {
                result = result.multiply(radixToPower);
                result = result.add(goog.math.Long.fromNumber(value));
            }
        }
        return result;
    };
    goog.math.Long.TWO_PWR_16_DBL_ = 1 << 16;
    goog.math.Long.TWO_PWR_24_DBL_ = 1 << 24;
    goog.math.Long.TWO_PWR_32_DBL_ = goog.math.Long.TWO_PWR_16_DBL_ * goog.math.Long.TWO_PWR_16_DBL_;
    goog.math.Long.TWO_PWR_31_DBL_ = goog.math.Long.TWO_PWR_32_DBL_ / 2;
    goog.math.Long.TWO_PWR_48_DBL_ = goog.math.Long.TWO_PWR_32_DBL_ * goog.math.Long.TWO_PWR_16_DBL_;
    goog.math.Long.TWO_PWR_64_DBL_ = goog.math.Long.TWO_PWR_32_DBL_ * goog.math.Long.TWO_PWR_32_DBL_;
    goog.math.Long.TWO_PWR_63_DBL_ = goog.math.Long.TWO_PWR_64_DBL_ / 2;
    goog.math.Long.ZERO = goog.math.Long.fromInt(0);
    goog.math.Long.ONE = goog.math.Long.fromInt(1);
    goog.math.Long.NEG_ONE = goog.math.Long.fromInt(-1);
    goog.math.Long.MAX_VALUE = goog.math.Long.fromBits(4294967295 | 0, 2147483647 | 0);
    goog.math.Long.MIN_VALUE = goog.math.Long.fromBits(0, 2147483648 | 0);
    goog.math.Long.TWO_PWR_24_ = goog.math.Long.fromInt(1 << 24);
    goog.math.Long.prototype.toInt = function () {
        return this.low_;
    };
    goog.math.Long.prototype.toNumber = function () {
        return this.high_ * goog.math.Long.TWO_PWR_32_DBL_ + this.getLowBitsUnsigned();
    };
    goog.math.Long.prototype.toString = function (opt_radix) {
        var radix = opt_radix || 10;
        if (radix < 2 || 36 < radix) {
            throw Error("radix out of range: " + radix);
        }
        if (this.isZero()) {
            return "0";
        }
        if (this.isNegative()) {
            if (this.equals(goog.math.Long.MIN_VALUE)) {
                var radixLong = goog.math.Long.fromNumber(radix);
                var div = this.div(radixLong);
                var rem = div.multiply(radixLong).subtract(this);
                return div.toString(radix) + rem.toInt().toString(radix);
            } else {
                return "-" + this.negate().toString(radix);
            }
        }
        var radixToPower = goog.math.Long.fromNumber(Math.pow(radix, 6));
        var rem = this;
        var result = "";
        while (true) {
            var remDiv = rem.div(radixToPower);
            var intval = rem.subtract(remDiv.multiply(radixToPower)).toInt();
            var digits = intval.toString(radix);
            rem = remDiv;
            if (rem.isZero()) {
                return digits + result;
            } else {
                while (digits.length < 6) {
                    digits = "0" + digits;
                }
                result = "" + digits + result;
            }
        }
    };
    goog.math.Long.prototype.getHighBits = function () {
        return this.high_;
    };
    goog.math.Long.prototype.getLowBits = function () {
        return this.low_;
    };
    goog.math.Long.prototype.getLowBitsUnsigned = function () {
        return this.low_ >= 0 ? this.low_ : goog.math.Long.TWO_PWR_32_DBL_ + this.low_;
    };
    goog.math.Long.prototype.getNumBitsAbs = function () {
        if (this.isNegative()) {
            if (this.equals(goog.math.Long.MIN_VALUE)) {
                return 64;
            } else {
                return this.negate().getNumBitsAbs();
            }
        } else {
            var val = this.high_ != 0 ? this.high_ : this.low_;
            for (var bit = 31; bit > 0; bit--) {
                if ((val & (1 << bit)) != 0) {
                    break;
                }
            }
            return this.high_ != 0 ? bit + 33 : bit + 1;
        }
    };
    goog.math.Long.prototype.isZero = function () {
        return this.high_ == 0 && this.low_ == 0;
    };
    goog.math.Long.prototype.isNegative = function () {
        return this.high_ < 0;
    };
    goog.math.Long.prototype.isOdd = function () {
        return (this.low_ & 1) == 1;
    };
    goog.math.Long.prototype.equals = function (other) {
        return this.high_ == other.high_ && this.low_ == other.low_;
    };
    goog.math.Long.prototype.notEquals = function (other) {
        return this.high_ != other.high_ || this.low_ != other.low_;
    };
    goog.math.Long.prototype.lessThan = function (other) {
        return this.compare(other) < 0;
    };
    goog.math.Long.prototype.lessThanOrEqual = function (other) {
        return this.compare(other) <= 0;
    };
    goog.math.Long.prototype.greaterThan = function (other) {
        return this.compare(other) > 0;
    };
    goog.math.Long.prototype.greaterThanOrEqual = function (other) {
        return this.compare(other) >= 0;
    };
    goog.math.Long.prototype.compare = function (other) {
        if (this.equals(other)) {
            return 0;
        }
        var thisNeg = this.isNegative();
        var otherNeg = other.isNegative();
        if (thisNeg && !otherNeg) {
            return -1;
        }
        if (!thisNeg && otherNeg) {
            return 1;
        }
        if (this.subtract(other).isNegative()) {
            return -1;
        } else {
            return 1;
        }
    };
    goog.math.Long.prototype.negate = function () {
        if (this.equals(goog.math.Long.MIN_VALUE)) {
            return goog.math.Long.MIN_VALUE;
        } else {
            return this.not().add(goog.math.Long.ONE);
        }
    };
    goog.math.Long.prototype.add = function (other) {
        var a48 = this.high_ >>> 16;
        var a32 = this.high_ & 65535;
        var a16 = this.low_ >>> 16;
        var a00 = this.low_ & 65535;
        var b48 = other.high_ >>> 16;
        var b32 = other.high_ & 65535;
        var b16 = other.low_ >>> 16;
        var b00 = other.low_ & 65535;
        var c48 = 0,
            c32 = 0,
            c16 = 0,
            c00 = 0;
        c00 += a00 + b00;
        c16 += c00 >>> 16;
        c00 &= 65535;
        c16 += a16 + b16;
        c32 += c16 >>> 16;
        c16 &= 65535;
        c32 += a32 + b32;
        c48 += c32 >>> 16;
        c32 &= 65535;
        c48 += a48 + b48;
        c48 &= 65535;
        return goog.math.Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
    };
    goog.math.Long.prototype.subtract = function (other) {
        return this.add(other.negate());
    };
    goog.math.Long.prototype.multiply = function (other) {
        if (this.isZero()) {
            return goog.math.Long.ZERO;
        } else if (other.isZero()) {
            return goog.math.Long.ZERO;
        }
        if (this.equals(goog.math.Long.MIN_VALUE)) {
            return other.isOdd() ? goog.math.Long.MIN_VALUE : goog.math.Long.ZERO;
        } else if (other.equals(goog.math.Long.MIN_VALUE)) {
            return this.isOdd() ? goog.math.Long.MIN_VALUE : goog.math.Long.ZERO;
        }
        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().multiply(other.negate());
            } else {
                return this.negate().multiply(other).negate();
            }
        } else if (other.isNegative()) {
            return this.multiply(other.negate()).negate();
        }
        if (this.lessThan(goog.math.Long.TWO_PWR_24_) && other.lessThan(goog.math.Long.TWO_PWR_24_)) {
            return goog.math.Long.fromNumber(this.toNumber() * other.toNumber());
        }
        var a48 = this.high_ >>> 16;
        var a32 = this.high_ & 65535;
        var a16 = this.low_ >>> 16;
        var a00 = this.low_ & 65535;
        var b48 = other.high_ >>> 16;
        var b32 = other.high_ & 65535;
        var b16 = other.low_ >>> 16;
        var b00 = other.low_ & 65535;
        var c48 = 0,
            c32 = 0,
            c16 = 0,
            c00 = 0;
        c00 += a00 * b00;
        c16 += c00 >>> 16;
        c00 &= 65535;
        c16 += a16 * b00;
        c32 += c16 >>> 16;
        c16 &= 65535;
        c16 += a00 * b16;
        c32 += c16 >>> 16;
        c16 &= 65535;
        c32 += a32 * b00;
        c48 += c32 >>> 16;
        c32 &= 65535;
        c32 += a16 * b16;
        c48 += c32 >>> 16;
        c32 &= 65535;
        c32 += a00 * b32;
        c48 += c32 >>> 16;
        c32 &= 65535;
        c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
        c48 &= 65535;
        return goog.math.Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
    };
    goog.math.Long.prototype.div = function (other) {
        if (other.isZero()) {
            throw Error("division by zero");
        } else if (this.isZero()) {
            return goog.math.Long.ZERO;
        }
        if (this.equals(goog.math.Long.MIN_VALUE)) {
            if (other.equals(goog.math.Long.ONE) || other.equals(goog.math.Long.NEG_ONE)) {
                return goog.math.Long.MIN_VALUE;
            } else if (other.equals(goog.math.Long.MIN_VALUE)) {
                return goog.math.Long.ONE;
            } else {
                var halfThis = this.shiftRight(1);
                var approx = halfThis.div(other).shiftLeft(1);
                if (approx.equals(goog.math.Long.ZERO)) {
                    return other.isNegative() ? goog.math.Long.ONE : goog.math.Long.NEG_ONE;
                } else {
                    var rem = this.subtract(other.multiply(approx));
                    var result = approx.add(rem.div(other));
                    return result;
                }
            }
        } else if (other.equals(goog.math.Long.MIN_VALUE)) {
            return goog.math.Long.ZERO;
        }
        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().div(other.negate());
            } else {
                return this.negate().div(other).negate();
            }
        } else if (other.isNegative()) {
            return this.div(other.negate()).negate();
        }
        var res = goog.math.Long.ZERO;
        var rem = this;
        while (rem.greaterThanOrEqual(other)) {
            var approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));
            var log2 = Math.ceil(Math.log(approx) / Math.LN2);
            var delta = log2 <= 48 ? 1 : Math.pow(2, log2 - 48);
            var approxRes = goog.math.Long.fromNumber(approx);
            var approxRem = approxRes.multiply(other);
            while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
                approx -= delta;
                approxRes = goog.math.Long.fromNumber(approx);
                approxRem = approxRes.multiply(other);
            }
            if (approxRes.isZero()) {
                approxRes = goog.math.Long.ONE;
            }
            res = res.add(approxRes);
            rem = rem.subtract(approxRem);
        }
        return res;
    };
    goog.math.Long.prototype.modulo = function (other) {
        return this.subtract(this.div(other).multiply(other));
    };
    goog.math.Long.prototype.not = function () {
        return goog.math.Long.fromBits(~this.low_, ~this.high_);
    };
    goog.math.Long.prototype.and = function (other) {
        return goog.math.Long.fromBits(this.low_ & other.low_, this.high_ & other.high_);
    };
    goog.math.Long.prototype.or = function (other) {
        return goog.math.Long.fromBits(this.low_ | other.low_, this.high_ | other.high_);
    };
    goog.math.Long.prototype.xor = function (other) {
        return goog.math.Long.fromBits(this.low_ ^ other.low_, this.high_ ^ other.high_);
    };
    goog.math.Long.prototype.shiftLeft = function (numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var low = this.low_;
            if (numBits < 32) {
                var high = this.high_;
                return goog.math.Long.fromBits(low << numBits, (high << numBits) | (low >>> (32 - numBits)));
            } else {
                return goog.math.Long.fromBits(0, low << (numBits - 32));
            }
        }
    };
    goog.math.Long.prototype.shiftRight = function (numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high_;
            if (numBits < 32) {
                var low = this.low_;
                return goog.math.Long.fromBits((low >>> numBits) | (high << (32 - numBits)), high >> numBits);
            } else {
                return goog.math.Long.fromBits(high >> (numBits - 32), high >= 0 ? 0 : -1);
            }
        }
    };
    goog.math.Long.prototype.shiftRightUnsigned = function (numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high_;
            if (numBits < 32) {
                var low = this.low_;
                return goog.math.Long.fromBits((low >>> numBits) | (high << (32 - numBits)), high >>> numBits);
            } else if (numBits == 32) {
                return goog.math.Long.fromBits(high, 0);
            } else {
                return goog.math.Long.fromBits(high >>> (numBits - 32), 0);
            }
        }
    };
    var navigator = { appName: "Modern Browser" };
    var dbits;
    var canary = 0xdeadbeefcafe;
    var j_lm = (canary & 16777215) == 15715070;
    function BigInteger(a, b, c) {
        if (a != null)
            if ("number" == typeof a) this.fromNumber(a, b, c);
            else if (b == null && "string" != typeof a) this.fromString(a, 256);
            else this.fromString(a, b);
    }
    function nbi() {
        return new BigInteger(null);
    }
    function am1(i, x, w, j, c, n) {
        while (--n >= 0) {
            var v = x * this[i++] + w[j] + c;
            c = Math.floor(v / 67108864);
            w[j++] = v & 67108863;
        }
        return c;
    }
    function am2(i, x, w, j, c, n) {
        var xl = x & 32767,
            xh = x >> 15;
        while (--n >= 0) {
            var l = this[i] & 32767;
            var h = this[i++] >> 15;
            var m = xh * l + h * xl;
            l = xl * l + ((m & 32767) << 15) + w[j] + (c & 1073741823);
            c = (l >>> 30) + (m >>> 15) + xh * h + (c >>> 30);
            w[j++] = l & 1073741823;
        }
        return c;
    }
    function am3(i, x, w, j, c, n) {
        var xl = x & 16383,
            xh = x >> 14;
        while (--n >= 0) {
            var l = this[i] & 16383;
            var h = this[i++] >> 14;
            var m = xh * l + h * xl;
            l = xl * l + ((m & 16383) << 14) + w[j] + c;
            c = (l >> 28) + (m >> 14) + xh * h;
            w[j++] = l & 268435455;
        }
        return c;
    }
    if (j_lm && navigator.appName == "Microsoft Internet Explorer") {
        BigInteger.prototype.am = am2;
        dbits = 30;
    } else if (j_lm && navigator.appName != "Netscape") {
        BigInteger.prototype.am = am1;
        dbits = 26;
    } else {
        BigInteger.prototype.am = am3;
        dbits = 28;
    }
    BigInteger.prototype.DB = dbits;
    BigInteger.prototype.DM = (1 << dbits) - 1;
    BigInteger.prototype.DV = 1 << dbits;
    var BI_FP = 52;
    BigInteger.prototype.FV = Math.pow(2, BI_FP);
    BigInteger.prototype.F1 = BI_FP - dbits;
    BigInteger.prototype.F2 = 2 * dbits - BI_FP;
    var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
    var BI_RC = new Array();
    var rr, vv;
    rr = "0".charCodeAt(0);
    for (vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
    rr = "a".charCodeAt(0);
    for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
    rr = "A".charCodeAt(0);
    for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
    function int2char(n) {
        return BI_RM.charAt(n);
    }
    function intAt(s, i) {
        var c = BI_RC[s.charCodeAt(i)];
        return c == null ? -1 : c;
    }
    function bnpCopyTo(r) {
        for (var i = this.t - 1; i >= 0; --i) r[i] = this[i];
        r.t = this.t;
        r.s = this.s;
    }
    function bnpFromInt(x) {
        this.t = 1;
        this.s = x < 0 ? -1 : 0;
        if (x > 0) this[0] = x;
        else if (x < -1) this[0] = x + DV;
        else this.t = 0;
    }
    function nbv(i) {
        var r = nbi();
        r.fromInt(i);
        return r;
    }
    function bnpFromString(s, b) {
        var k;
        if (b == 16) k = 4;
        else if (b == 8) k = 3;
        else if (b == 256) k = 8;
        else if (b == 2) k = 1;
        else if (b == 32) k = 5;
        else if (b == 4) k = 2;
        else {
            this.fromRadix(s, b);
            return;
        }
        this.t = 0;
        this.s = 0;
        var i = s.length,
            mi = false,
            sh = 0;
        while (--i >= 0) {
            var x = k == 8 ? s[i] & 255 : intAt(s, i);
            if (x < 0) {
                if (s.charAt(i) == "-") mi = true;
                continue;
            }
            mi = false;
            if (sh == 0) this[this.t++] = x;
            else if (sh + k > this.DB) {
                this[this.t - 1] |= (x & ((1 << (this.DB - sh)) - 1)) << sh;
                this[this.t++] = x >> (this.DB - sh);
            } else this[this.t - 1] |= x << sh;
            sh += k;
            if (sh >= this.DB) sh -= this.DB;
        }
        if (k == 8 && (s[0] & 128) != 0) {
            this.s = -1;
            if (sh > 0) this[this.t - 1] |= ((1 << (this.DB - sh)) - 1) << sh;
        }
        this.clamp();
        if (mi) BigInteger.ZERO.subTo(this, this);
    }
    function bnpClamp() {
        var c = this.s & this.DM;
        while (this.t > 0 && this[this.t - 1] == c) --this.t;
    }
    function bnToString(b) {
        if (this.s < 0) return "-" + this.negate().toString(b);
        var k;
        if (b == 16) k = 4;
        else if (b == 8) k = 3;
        else if (b == 2) k = 1;
        else if (b == 32) k = 5;
        else if (b == 4) k = 2;
        else return this.toRadix(b);
        var km = (1 << k) - 1,
            d,
            m = false,
            r = "",
            i = this.t;
        var p = this.DB - ((i * this.DB) % k);
        if (i-- > 0) {
            if (p < this.DB && (d = this[i] >> p) > 0) {
                m = true;
                r = int2char(d);
            }
            while (i >= 0) {
                if (p < k) {
                    d = (this[i] & ((1 << p) - 1)) << (k - p);
                    d |= this[--i] >> (p += this.DB - k);
                } else {
                    d = (this[i] >> (p -= k)) & km;
                    if (p <= 0) {
                        p += this.DB;
                        --i;
                    }
                }
                if (d > 0) m = true;
                if (m) r += int2char(d);
            }
        }
        return m ? r : "0";
    }
    function bnNegate() {
        var r = nbi();
        BigInteger.ZERO.subTo(this, r);
        return r;
    }
    function bnAbs() {
        return this.s < 0 ? this.negate() : this;
    }
    function bnCompareTo(a) {
        var r = this.s - a.s;
        if (r != 0) return r;
        var i = this.t;
        r = i - a.t;
        if (r != 0) return this.s < 0 ? -r : r;
        while (--i >= 0) if ((r = this[i] - a[i]) != 0) return r;
        return 0;
    }
    function nbits(x) {
        var r = 1,
            t;
        if ((t = x >>> 16) != 0) {
            x = t;
            r += 16;
        }
        if ((t = x >> 8) != 0) {
            x = t;
            r += 8;
        }
        if ((t = x >> 4) != 0) {
            x = t;
            r += 4;
        }
        if ((t = x >> 2) != 0) {
            x = t;
            r += 2;
        }
        if ((t = x >> 1) != 0) {
            x = t;
            r += 1;
        }
        return r;
    }
    function bnBitLength() {
        if (this.t <= 0) return 0;
        return this.DB * (this.t - 1) + nbits(this[this.t - 1] ^ (this.s & this.DM));
    }
    function bnpDLShiftTo(n, r) {
        var i;
        for (i = this.t - 1; i >= 0; --i) r[i + n] = this[i];
        for (i = n - 1; i >= 0; --i) r[i] = 0;
        r.t = this.t + n;
        r.s = this.s;
    }
    function bnpDRShiftTo(n, r) {
        for (var i = n; i < this.t; ++i) r[i - n] = this[i];
        r.t = Math.max(this.t - n, 0);
        r.s = this.s;
    }
    function bnpLShiftTo(n, r) {
        var bs = n % this.DB;
        var cbs = this.DB - bs;
        var bm = (1 << cbs) - 1;
        var ds = Math.floor(n / this.DB),
            c = (this.s << bs) & this.DM,
            i;
        for (i = this.t - 1; i >= 0; --i) {
            r[i + ds + 1] = (this[i] >> cbs) | c;
            c = (this[i] & bm) << bs;
        }
        for (i = ds - 1; i >= 0; --i) r[i] = 0;
        r[ds] = c;
        r.t = this.t + ds + 1;
        r.s = this.s;
        r.clamp();
    }
    function bnpRShiftTo(n, r) {
        r.s = this.s;
        var ds = Math.floor(n / this.DB);
        if (ds >= this.t) {
            r.t = 0;
            return;
        }
        var bs = n % this.DB;
        var cbs = this.DB - bs;
        var bm = (1 << bs) - 1;
        r[0] = this[ds] >> bs;
        for (var i = ds + 1; i < this.t; ++i) {
            r[i - ds - 1] |= (this[i] & bm) << cbs;
            r[i - ds] = this[i] >> bs;
        }
        if (bs > 0) r[this.t - ds - 1] |= (this.s & bm) << cbs;
        r.t = this.t - ds;
        r.clamp();
    }
    function bnpSubTo(a, r) {
        var i = 0,
            c = 0,
            m = Math.min(a.t, this.t);
        while (i < m) {
            c += this[i] - a[i];
            r[i++] = c & this.DM;
            c >>= this.DB;
        }
        if (a.t < this.t) {
            c -= a.s;
            while (i < this.t) {
                c += this[i];
                r[i++] = c & this.DM;
                c >>= this.DB;
            }
            c += this.s;
        } else {
            c += this.s;
            while (i < a.t) {
                c -= a[i];
                r[i++] = c & this.DM;
                c >>= this.DB;
            }
            c -= a.s;
        }
        r.s = c < 0 ? -1 : 0;
        if (c < -1) r[i++] = this.DV + c;
        else if (c > 0) r[i++] = c;
        r.t = i;
        r.clamp();
    }
    function bnpMultiplyTo(a, r) {
        var x = this.abs(),
            y = a.abs();
        var i = x.t;
        r.t = i + y.t;
        while (--i >= 0) r[i] = 0;
        for (i = 0; i < y.t; ++i) r[i + x.t] = x.am(0, y[i], r, i, 0, x.t);
        r.s = 0;
        r.clamp();
        if (this.s != a.s) BigInteger.ZERO.subTo(r, r);
    }
    function bnpSquareTo(r) {
        var x = this.abs();
        var i = (r.t = 2 * x.t);
        while (--i >= 0) r[i] = 0;
        for (i = 0; i < x.t - 1; ++i) {
            var c = x.am(i, x[i], r, 2 * i, 0, 1);
            if ((r[i + x.t] += x.am(i + 1, 2 * x[i], r, 2 * i + 1, c, x.t - i - 1)) >= x.DV) {
                r[i + x.t] -= x.DV;
                r[i + x.t + 1] = 1;
            }
        }
        if (r.t > 0) r[r.t - 1] += x.am(i, x[i], r, 2 * i, 0, 1);
        r.s = 0;
        r.clamp();
    }
    function bnpDivRemTo(m, q, r) {
        var pm = m.abs();
        if (pm.t <= 0) return;
        var pt = this.abs();
        if (pt.t < pm.t) {
            if (q != null) q.fromInt(0);
            if (r != null) this.copyTo(r);
            return;
        }
        if (r == null) r = nbi();
        var y = nbi(),
            ts = this.s,
            ms = m.s;
        var nsh = this.DB - nbits(pm[pm.t - 1]);
        if (nsh > 0) {
            pm.lShiftTo(nsh, y);
            pt.lShiftTo(nsh, r);
        } else {
            pm.copyTo(y);
            pt.copyTo(r);
        }
        var ys = y.t;
        var y0 = y[ys - 1];
        if (y0 == 0) return;
        var yt = y0 * (1 << this.F1) + (ys > 1 ? y[ys - 2] >> this.F2 : 0);
        var d1 = this.FV / yt,
            d2 = (1 << this.F1) / yt,
            e = 1 << this.F2;
        var i = r.t,
            j = i - ys,
            t = q == null ? nbi() : q;
        y.dlShiftTo(j, t);
        if (r.compareTo(t) >= 0) {
            r[r.t++] = 1;
            r.subTo(t, r);
        }
        BigInteger.ONE.dlShiftTo(ys, t);
        t.subTo(y, y);
        while (y.t < ys) y[y.t++] = 0;
        while (--j >= 0) {
            var qd = r[--i] == y0 ? this.DM : Math.floor(r[i] * d1 + (r[i - 1] + e) * d2);
            if ((r[i] += y.am(0, qd, r, j, 0, ys)) < qd) {
                y.dlShiftTo(j, t);
                r.subTo(t, r);
                while (r[i] < --qd) r.subTo(t, r);
            }
        }
        if (q != null) {
            r.drShiftTo(ys, q);
            if (ts != ms) BigInteger.ZERO.subTo(q, q);
        }
        r.t = ys;
        r.clamp();
        if (nsh > 0) r.rShiftTo(nsh, r);
        if (ts < 0) BigInteger.ZERO.subTo(r, r);
    }
    function bnMod(a) {
        var r = nbi();
        this.abs().divRemTo(a, null, r);
        if (this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r, r);
        return r;
    }
    function Classic(m) {
        this.m = m;
    }
    function cConvert(x) {
        if (x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
        else return x;
    }
    function cRevert(x) {
        return x;
    }
    function cReduce(x) {
        x.divRemTo(this.m, null, x);
    }
    function cMulTo(x, y, r) {
        x.multiplyTo(y, r);
        this.reduce(r);
    }
    function cSqrTo(x, r) {
        x.squareTo(r);
        this.reduce(r);
    }
    Classic.prototype.convert = cConvert;
    Classic.prototype.revert = cRevert;
    Classic.prototype.reduce = cReduce;
    Classic.prototype.mulTo = cMulTo;
    Classic.prototype.sqrTo = cSqrTo;
    function bnpInvDigit() {
        if (this.t < 1) return 0;
        var x = this[0];
        if ((x & 1) == 0) return 0;
        var y = x & 3;
        y = (y * (2 - (x & 15) * y)) & 15;
        y = (y * (2 - (x & 255) * y)) & 255;
        y = (y * (2 - (((x & 65535) * y) & 65535))) & 65535;
        y = (y * (2 - ((x * y) % this.DV))) % this.DV;
        return y > 0 ? this.DV - y : -y;
    }
    function Montgomery(m) {
        this.m = m;
        this.mp = m.invDigit();
        this.mpl = this.mp & 32767;
        this.mph = this.mp >> 15;
        this.um = (1 << (m.DB - 15)) - 1;
        this.mt2 = 2 * m.t;
    }
    function montConvert(x) {
        var r = nbi();
        x.abs().dlShiftTo(this.m.t, r);
        r.divRemTo(this.m, null, r);
        if (x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r, r);
        return r;
    }
    function montRevert(x) {
        var r = nbi();
        x.copyTo(r);
        this.reduce(r);
        return r;
    }
    function montReduce(x) {
        while (x.t <= this.mt2) x[x.t++] = 0;
        for (var i = 0; i < this.m.t; ++i) {
            var j = x[i] & 32767;
            var u0 = (j * this.mpl + (((j * this.mph + (x[i] >> 15) * this.mpl) & this.um) << 15)) & x.DM;
            j = i + this.m.t;
            x[j] += this.m.am(0, u0, x, i, 0, this.m.t);
            while (x[j] >= x.DV) {
                x[j] -= x.DV;
                x[++j]++;
            }
        }
        x.clamp();
        x.drShiftTo(this.m.t, x);
        if (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
    }
    function montSqrTo(x, r) {
        x.squareTo(r);
        this.reduce(r);
    }
    function montMulTo(x, y, r) {
        x.multiplyTo(y, r);
        this.reduce(r);
    }
    Montgomery.prototype.convert = montConvert;
    Montgomery.prototype.revert = montRevert;
    Montgomery.prototype.reduce = montReduce;
    Montgomery.prototype.mulTo = montMulTo;
    Montgomery.prototype.sqrTo = montSqrTo;
    function bnpIsEven() {
        return (this.t > 0 ? this[0] & 1 : this.s) == 0;
    }
    function bnpExp(e, z) {
        if (e > 4294967295 || e < 1) return BigInteger.ONE;
        var r = nbi(),
            r2 = nbi(),
            g = z.convert(this),
            i = nbits(e) - 1;
        g.copyTo(r);
        while (--i >= 0) {
            z.sqrTo(r, r2);
            if ((e & (1 << i)) > 0) z.mulTo(r2, g, r);
            else {
                var t = r;
                r = r2;
                r2 = t;
            }
        }
        return z.revert(r);
    }
    function bnModPowInt(e, m) {
        var z;
        if (e < 256 || m.isEven()) z = new Classic(m);
        else z = new Montgomery(m);
        return this.exp(e, z);
    }
    BigInteger.prototype.copyTo = bnpCopyTo;
    BigInteger.prototype.fromInt = bnpFromInt;
    BigInteger.prototype.fromString = bnpFromString;
    BigInteger.prototype.clamp = bnpClamp;
    BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
    BigInteger.prototype.drShiftTo = bnpDRShiftTo;
    BigInteger.prototype.lShiftTo = bnpLShiftTo;
    BigInteger.prototype.rShiftTo = bnpRShiftTo;
    BigInteger.prototype.subTo = bnpSubTo;
    BigInteger.prototype.multiplyTo = bnpMultiplyTo;
    BigInteger.prototype.squareTo = bnpSquareTo;
    BigInteger.prototype.divRemTo = bnpDivRemTo;
    BigInteger.prototype.invDigit = bnpInvDigit;
    BigInteger.prototype.isEven = bnpIsEven;
    BigInteger.prototype.exp = bnpExp;
    BigInteger.prototype.toString = bnToString;
    BigInteger.prototype.negate = bnNegate;
    BigInteger.prototype.abs = bnAbs;
    BigInteger.prototype.compareTo = bnCompareTo;
    BigInteger.prototype.bitLength = bnBitLength;
    BigInteger.prototype.mod = bnMod;
    BigInteger.prototype.modPowInt = bnModPowInt;
    BigInteger.ZERO = nbv(0);
    BigInteger.ONE = nbv(1);
    function bnpFromRadix(s, b) {
        this.fromInt(0);
        if (b == null) b = 10;
        var cs = this.chunkSize(b);
        var d = Math.pow(b, cs),
            mi = false,
            j = 0,
            w = 0;
        for (var i = 0; i < s.length; ++i) {
            var x = intAt(s, i);
            if (x < 0) {
                if (s.charAt(i) == "-" && this.signum() == 0) mi = true;
                continue;
            }
            w = b * w + x;
            if (++j >= cs) {
                this.dMultiply(d);
                this.dAddOffset(w, 0);
                j = 0;
                w = 0;
            }
        }
        if (j > 0) {
            this.dMultiply(Math.pow(b, j));
            this.dAddOffset(w, 0);
        }
        if (mi) BigInteger.ZERO.subTo(this, this);
    }
    function bnpChunkSize(r) {
        return Math.floor((Math.LN2 * this.DB) / Math.log(r));
    }
    function bnSigNum() {
        if (this.s < 0) return -1;
        else if (this.t <= 0 || (this.t == 1 && this[0] <= 0)) return 0;
        else return 1;
    }
    function bnpDMultiply(n) {
        this[this.t] = this.am(0, n - 1, this, 0, 0, this.t);
        ++this.t;
        this.clamp();
    }
    function bnpDAddOffset(n, w) {
        if (n == 0) return;
        while (this.t <= w) this[this.t++] = 0;
        this[w] += n;
        while (this[w] >= this.DV) {
            this[w] -= this.DV;
            if (++w >= this.t) this[this.t++] = 0;
            ++this[w];
        }
    }
    function bnpToRadix(b) {
        if (b == null) b = 10;
        if (this.signum() == 0 || b < 2 || b > 36) return "0";
        var cs = this.chunkSize(b);
        var a = Math.pow(b, cs);
        var d = nbv(a),
            y = nbi(),
            z = nbi(),
            r = "";
        this.divRemTo(d, y, z);
        while (y.signum() > 0) {
            r = (a + z.intValue()).toString(b).substr(1) + r;
            y.divRemTo(d, y, z);
        }
        return z.intValue().toString(b) + r;
    }
    function bnIntValue() {
        if (this.s < 0) {
            if (this.t == 1) return this[0] - this.DV;
            else if (this.t == 0) return -1;
        } else if (this.t == 1) return this[0];
        else if (this.t == 0) return 0;
        return ((this[1] & ((1 << (32 - this.DB)) - 1)) << this.DB) | this[0];
    }
    function bnpAddTo(a, r) {
        var i = 0,
            c = 0,
            m = Math.min(a.t, this.t);
        while (i < m) {
            c += this[i] + a[i];
            r[i++] = c & this.DM;
            c >>= this.DB;
        }
        if (a.t < this.t) {
            c += a.s;
            while (i < this.t) {
                c += this[i];
                r[i++] = c & this.DM;
                c >>= this.DB;
            }
            c += this.s;
        } else {
            c += this.s;
            while (i < a.t) {
                c += a[i];
                r[i++] = c & this.DM;
                c >>= this.DB;
            }
            c += a.s;
        }
        r.s = c < 0 ? -1 : 0;
        if (c > 0) r[i++] = c;
        else if (c < -1) r[i++] = this.DV + c;
        r.t = i;
        r.clamp();
    }
    BigInteger.prototype.fromRadix = bnpFromRadix;
    BigInteger.prototype.chunkSize = bnpChunkSize;
    BigInteger.prototype.signum = bnSigNum;
    BigInteger.prototype.dMultiply = bnpDMultiply;
    BigInteger.prototype.dAddOffset = bnpDAddOffset;
    BigInteger.prototype.toRadix = bnpToRadix;
    BigInteger.prototype.intValue = bnIntValue;
    BigInteger.prototype.addTo = bnpAddTo;
    var Wrapper = {
        abs: function (l, h) {
            var x = new goog.math.Long(l, h);
            var ret;
            if (x.isNegative()) {
                ret = x.negate();
            } else {
                ret = x;
            }
            HEAP32[tempDoublePtr >> 2] = ret.low_;
            HEAP32[(tempDoublePtr + 4) >> 2] = ret.high_;
        },
        ensureTemps: function () {
            if (Wrapper.ensuredTemps) return;
            Wrapper.ensuredTemps = true;
            Wrapper.two32 = new BigInteger();
            Wrapper.two32.fromString("4294967296", 10);
            Wrapper.two64 = new BigInteger();
            Wrapper.two64.fromString("18446744073709551616", 10);
            Wrapper.temp1 = new BigInteger();
            Wrapper.temp2 = new BigInteger();
        },
        lh2bignum: function (l, h) {
            var a = new BigInteger();
            a.fromString(h.toString(), 10);
            var b = new BigInteger();
            a.multiplyTo(Wrapper.two32, b);
            var c = new BigInteger();
            c.fromString(l.toString(), 10);
            var d = new BigInteger();
            c.addTo(b, d);
            return d;
        },
        stringify: function (l, h, unsigned) {
            var ret = new goog.math.Long(l, h).toString();
            if (unsigned && ret[0] == "-") {
                Wrapper.ensureTemps();
                var bignum = new BigInteger();
                bignum.fromString(ret, 10);
                ret = new BigInteger();
                Wrapper.two64.addTo(bignum, ret);
                ret = ret.toString(10);
            }
            return ret;
        },
        fromString: function (str, base, min, max, unsigned) {
            Wrapper.ensureTemps();
            var bignum = new BigInteger();
            bignum.fromString(str, base);
            var bigmin = new BigInteger();
            bigmin.fromString(min, 10);
            var bigmax = new BigInteger();
            bigmax.fromString(max, 10);
            if (unsigned && bignum.compareTo(BigInteger.ZERO) < 0) {
                var temp = new BigInteger();
                bignum.addTo(Wrapper.two64, temp);
                bignum = temp;
            }
            var error = false;
            if (bignum.compareTo(bigmin) < 0) {
                bignum = bigmin;
                error = true;
            } else if (bignum.compareTo(bigmax) > 0) {
                bignum = bigmax;
                error = true;
            }
            var ret = goog.math.Long.fromString(bignum.toString());
            HEAP32[tempDoublePtr >> 2] = ret.low_;
            HEAP32[(tempDoublePtr + 4) >> 2] = ret.high_;
            if (error) throw "range error";
        },
    };
    return Wrapper;
})();
if (memoryInitializer) {
    if (typeof Module["locateFile"] === "function") {
        memoryInitializer = Module["locateFile"](memoryInitializer);
    } else if (Module["memoryInitializerPrefixURL"]) {
        memoryInitializer = Module["memoryInitializerPrefixURL"] + memoryInitializer;
    }
    if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
        var data = Module["readBinary"](memoryInitializer);
        HEAPU8.set(data, STATIC_BASE);
    } else {
        addRunDependency("memory initializer");
        Browser.asyncLoad(
            memoryInitializer,
            function (data) {
                HEAPU8.set(data, STATIC_BASE);
                removeRunDependency("memory initializer");
            },
            function (data) {
                throw "could not load memory initializer " + memoryInitializer;
            }
        );
    }
}
function ExitStatus(status) {
    this.name = "ExitStatus";
    this.message = "Program terminated with exit(" + status + ")";
    this.status = status;
}
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;
var initialStackTop;
var preloadStartTime = null;
var calledMain = false;
dependenciesFulfilled = function runCaller() {
    if (!Module["calledRun"] && shouldRunNow) run();
    if (!Module["calledRun"]) dependenciesFulfilled = runCaller;
};
Module["callMain"] = Module.callMain = function callMain(args) {
    assert(runDependencies == 0, "cannot call main when async dependencies remain! (listen on __ATMAIN__)");
    assert(__ATPRERUN__.length == 0, "cannot call main when preRun functions remain to be called");
    args = args || [];
    ensureInitRuntime();
    var argc = args.length + 1;
    function pad() {
        for (var i = 0; i < 4 - 1; i++) {
            argv.push(0);
        }
    }
    var argv = [allocate(intArrayFromString(Module["thisProgram"]), "i8", ALLOC_NORMAL)];
    pad();
    for (var i = 0; i < argc - 1; i = i + 1) {
        argv.push(allocate(intArrayFromString(args[i]), "i8", ALLOC_NORMAL));
        pad();
    }
    argv.push(0);
    argv = allocate(argv, "i32", ALLOC_NORMAL);
    initialStackTop = STACKTOP;
    try {
        var ret = Module["_main"](argc, argv, 0);
        exit(ret);
    } catch (e) {
        if (e instanceof ExitStatus) {
            return;
        } else if (e == "SimulateInfiniteLoop") {
            Module["noExitRuntime"] = true;
            return;
        } else {
            if (e && typeof e === "object" && e.stack) Module.printErr("exception thrown: " + [e, e.stack]);
            throw e;
        }
    } finally {
        calledMain = true;
    }
};
function run(args) {
    args = args || Module["arguments"];
    if (preloadStartTime === null) preloadStartTime = Date.now();
    if (runDependencies > 0) {
        return;
    }
    preRun();
    if (runDependencies > 0) return;
    if (Module["calledRun"]) return;
    function doRun() {
        if (Module["calledRun"]) return;
        Module["calledRun"] = true;
        if (ABORT) return;
        ensureInitRuntime();
        preMain();
        if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
            Module.printErr("pre-main prep time: " + (Date.now() - preloadStartTime) + " ms");
        }
        if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
        if (Module["_main"] && shouldRunNow) Module["callMain"](args);
        postRun();
    }
    if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(function () {
            setTimeout(function () {
                Module["setStatus"]("");
            }, 1);
            doRun();
        }, 1);
    } else {
        doRun();
    }
}
Module["run"] = Module.run = run;
function exit(status) {
    if (Module["noExitRuntime"]) {
        return;
    }
    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;
    exitRuntime();
    if (ENVIRONMENT_IS_NODE) {
        process["stdout"]["once"]("drain", function () {
            process["exit"](status);
        });
        console.log(" ");
        setTimeout(function () {
            process["exit"](status);
        }, 500);
    } else if (ENVIRONMENT_IS_SHELL && typeof quit === "function") {
        quit(status);
    }
    throw new ExitStatus(status);
}
Module["exit"] = Module.exit = exit;
function abort(text) {
    if (text) {
        Module.print(text);
        Module.printErr(text);
    }
    ABORT = true;
    EXITSTATUS = 1;
    var extra = "\nIf this abort() is unexpected, build with -s ASSERTIONS=1 which can give more information.";
    throw "abort() at " + stackTrace() + extra;
}
Module["abort"] = Module.abort = abort;
if (Module["preInit"]) {
    if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
    while (Module["preInit"].length > 0) {
        Module["preInit"].pop()();
    }
}
var shouldRunNow = true;
if (Module["noInitialRun"]) {
    shouldRunNow = false;
}
run();
