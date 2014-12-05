var utils = require("utils"),
    type = require("type");


var qs = module.exports,
    hasOwnProp = Object.prototype.hasOwnProperty,

    reDecode = /\+/g,
    reParseKeysParent = /^([^\[\]]*)/,
    reParseKeysChild = /(\[[^\[\]]*\])/g,
    reParseKeysReplacer = /\[|\]/g;


function mergeArrays(a, b) {
    var i = -1,
        length = b.length - 1,
        offset = a.length;

    while (i++ < length) {
        a[offset + i] = b[i];
    }

    return a;
}

function stringify(obj, prefix) {
    var key, values, i, length;

    obj = Buffer.isBuffer(obj) ? obj.toString() : obj instanceof Date ? obj.toISOString() : obj != null ? obj : "";

    if (type.isPrimitive(obj)) {
        return [encodeURIComponent(prefix) + "=" + encodeURIComponent(obj)];
    }

    values = [];

    if (type.isArrayLike(obj)) {
        i = -1;
        length = obj.length - 1;

        while (i++ < length) {
            mergeArrays(values, stringify(obj[i], prefix + "[" + i + "]"));
        }
    } else {
        for (key in obj) {
            if (hasOwnProp.call(obj, key)) {
                mergeArrays(values, stringify(obj[key], prefix + "[" + key + "]"));
            }
        }
    }

    return values;
}

qs.stringify = function(obj, options) {
    var keys = [],
        delimiter, key;

    delimiter = options && typeof(options.delimiter) !== "undefined" ? options.delimiter : "&";

    for (key in obj) {
        if (hasOwnProp.call(obj, key)) {
            mergeArrays(keys, stringify(obj[key], key));
        }
    }

    return keys.join(delimiter);
};

function decode(str) {
    var value, num;

    try {
        value = decodeURIComponent(str.replace(reDecode, " "));
        num = +value;
        return num !== num ? value : num;
    } catch (e) {
        return str;
    }
}

function parseValues(str, options) {
    var obj = {},
        parts = str.split(options.delimiter, options.parameterLimit === Infinity ? undefined : options.parameterLimit),
        i = -1,
        il = parts.length - 1,
        part, index, pos, key, val;

    while (i++ < il) {
        part = parts[i];
        index = part.indexOf("]=");
        pos = index === -1 ? part.indexOf("=") : index + 1;

        if (pos === -1) {
            obj[decode(part)] = "";
        } else {
            key = decode(part.slice(0, pos));
            val = decode(part.slice(pos + 1));

            obj[key] = hasOwnProp.call(obj, key) ? [obj[key], val] : val;
        }
    }

    return obj;
}

function parseObject(chain, val, options) {
    var root, obj, cleanRoot, index;

    if (!chain.length) return val;

    root = chain.shift();

    if (root === "[]") {
        obj = [parseObject(chain, val, options)];
    } else {
        cleanRoot = "[" === root[0] && "]" === root[root.length - 1] ? root.slice(1, root.length - 1) : root;
        index = +cleanRoot;

        if (!type.isNaN(index) && root !== cleanRoot && index <= options.arrayLimit) {
            obj = [];
            obj[index] = parseObject(chain, val, options);
        } else {
            obj = {};
            obj[cleanRoot] = parseObject(chain, val, options);
        }
    }

    return obj;
}

function parseKeys(key, val, options) {
    var parent = reParseKeysParent,
        child = reParseKeysChild,
        segment, keys, i;

    if (!key) return undefined;

    segment = parent.exec(key);

    if (hasOwnProp.call(segment[1])) {
        return undefined;
    }

    keys = [];
    segment[1] && (keys[keys.length] = segment[1]);

    i = 0;
    while (null !== (segment = child.exec(key)) && i < options.depth) {
        hasOwnProp.call(segment[1].replace(reParseKeysReplacer, "")) || (keys[keys.length] = segment[1]);
        i++;
    }

    segment && (keys[keys.length] = "[" + key.slice(segment.index) + "]");

    return parseObject(keys, val, options);
}

function compact(obj, refs) {
    var lookup, compacted, i, length, keys, key, value;

    if (!type.isObject(obj)) {
        return obj;
    }

    refs = refs || [];
    lookup = utils.indexOf(refs, obj);

    if (lookup !== -1) {
        return refs[lookup];
    }

    refs[refs.length] = obj;

    if (type.isArray(obj)) {
        compacted = [];

        i = -1;
        length = obj.length - 1;

        while (i++ < length) {
            value = obj[i];

            if (value != null) {
                compacted[compacted.length] = value;
            }
        }

        return compacted;
    }

    keys = utils.keys(obj);
    i = -1;
    length = keys.length - 1;

    while (i++ < length) {
        key = keys[i];
        obj[key] = compact(obj[key], refs);
    }

    return obj;
}

function arrayToObject(array) {
    var obj = {},
        i = -1,
        length = array.length - 1,
        value;

    while (i++ < length) {
        value = array[i];

        if (value != null) {
            obj[i] = value;
        }
    }

    return obj;
}

function merge(target, source) {
    var keys, i, il, k, kl, key, value;

    if (!source) {
        return target;
    }

    if (type.isArray(source)) {
        i = -1;
        il = source.length - 1;

        while (i++ < il) {
            key = target[i];
            value = source[i];

            if (value != null) {
                if (type.isObject(key)) {
                    target[i] = merge(key, value);
                } else {
                    target[i] = value;
                }
            }
        }

        return target;
    }

    if (type.isArray(target)) {
        if (typeof(source) !== "object") {
            target[target.length] = source;
            return target;
        } else {
            target = arrayToObject(target);
        }
    }

    keys = utils.keys(source);
    k = -1;
    kl = keys.length - 1;

    while (k++ < kl) {
        key = keys[k];
        value = source[key];

        if (value && typeof(value) === "object") {
            if (target[key] == null) {
                target[key] = value;
            } else {
                target[key] = merge(target[key], value);
            }
        } else {
            target[key] = value;
        }
    }

    return target;
}

qs.parse = function(str, options) {
    var obj = {},
        tempObj, keys, i, il, key, newObj;

    if (str === "" || str == null) {
        return obj;
    }

    options || (options = {});
    options.delimiter = typeof(options.delimiter) === "string" || (options.delimiter instanceof RegExp) ? options.delimiter : "&";
    options.depth = typeof(options.depth) === "number" ? options.depth : 5;
    options.arrayLimit = typeof(options.arrayLimit) === "number" ? options.arrayLimit : 20;
    options.parameterLimit = typeof(options.parameterLimit) === "number" ? options.parameterLimit : 1e3;

    tempObj = typeof(str) === "string" ? parseValues(str, options) : str;

    keys = utils.keys(tempObj);
    i = -1;
    il = keys.length - 1;

    while (i++ < il) {
        key = keys[i];
        newObj = parseKeys(key, tempObj[key], options);
        obj = merge(obj, newObj);
    }

    return compact(obj);
};
