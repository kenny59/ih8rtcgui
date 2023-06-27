const _ = require("lodash");
module.exports = function getArray(object, selectors) {
    if(Array.isArray(_.get(object, selectors.join('.')))) {
        return _.get(object, selectors.join('.'));
    } else {
        return Array.of(_.get(object, selectors.join('.')))
    }
}