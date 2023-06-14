module.exports = function getArray(object, selector) {
    return Array.isArray(object[selector]) ? object[selector] : Array.of(object[selector])
}