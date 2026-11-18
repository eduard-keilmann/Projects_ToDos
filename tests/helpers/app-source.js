const vm = require('node:vm');
const cache = new Map();

// Let the JavaScript parser find a declaration's end, including nested braces,
// regular expressions and templates. No next-function name/indentation contract.
function extractFunctionSource(script, name) {
  const functions = cache.get(script) || new Map();
  if (functions.has(name)) return functions.get(name);
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error('Invalid function name');
  const declaration = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(script);
  if (!declaration) throw new Error('Function not found: ' + name);
  let end = script.indexOf('}', declaration.index);
  while (end !== -1) {
    const source = script.slice(declaration.index, end + 1);
    try {
      new vm.Script('(' + source + ')');
      functions.set(name, source);
      cache.set(script, functions);
      return source;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    end = script.indexOf('}', end + 1);
  }
  throw new Error('Incomplete function: ' + name);
}
module.exports = { extractFunctionSource };
