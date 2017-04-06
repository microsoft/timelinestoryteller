var globals = require("./globals");

module.exports = {

    /**
     * Returns the next available z-index for an annotation
     * @returns {number} The next z-index
     */
    getNextZIndex: function () {
        var nextIndex = 0;
        (globals.annotation_list || [])
            .concat(globals.caption_list || [])
            .concat(globals.image_list || [])
            .forEach(function (item) {
                if (item.z_index >= nextIndex) {
                    nextIndex = item.z_index + 1;
                }
            });

        // globals.scenes = story.scenes;
        // globals.caption_list = story.caption_list;
        // globals.image_list = story.image_list;
        // globals.annotation_list = story.annotation_list;
        // globals.caption_index = story.caption_list.length - 1;
        // globals.image_index = story.image_list.length - 1;
        return nextIndex;
    }
};
