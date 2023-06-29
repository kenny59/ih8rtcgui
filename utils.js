const _ = require("lodash");
module.exports = function getArray(object, selectors) {
    if(!_.get(object, selectors)) return [];
    if(Array.isArray(_.get(object, selectors))) {
        return _.get(object, selectors);
    } else {
        return Array.of(_.get(object, selectors))
    }
}