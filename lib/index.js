// Copyright 2016 Yahoo Inc.
// Licensed under the terms of the MIT license. Please see LICENSE file in the project root for terms.

'use strict';

var merge = require('merge'),
    Row = require('./row'),
    layoutConfig = {},
    layoutData = {},
    currentRow = false;

/**
* Takes in a bunch of box data and config. Returns
* geometry to lay them out in a justified view.
*
* @method covertSizesToAspectRatios
* @param sizes {Array} Array of objects with widths and heights
* @return {Array} A list of aspect ratios
**/
module.exports = function (input) {
	var config = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

	// Defaults
	var defaults = {
		containerWidth: 1060,
		containerPadding: 10,
		boxSpacing: 10,
		targetRowHeight: 320,
		targetRowHeightTolerance: 0.25,
		maxNumRows: Number.POSITIVE_INFINITY,
		forceAspectRatio: false,
		showWidows: true,
		fullWidthBreakoutRowCadence: false
	};

	// Merge defaults and config passed in
	layoutConfig = merge(defaults, config);

	// Sort out padding and spacing values
	var containerPadding = {};
	var boxSpacing = {};

	containerPadding.top = !isNaN(parseFloat(layoutConfig.containerPadding.top)) ? layoutConfig.containerPadding.top : layoutConfig.containerPadding;
	containerPadding.right = !isNaN(parseFloat(layoutConfig.containerPadding.right)) ? layoutConfig.containerPadding.right : layoutConfig.containerPadding;
	containerPadding.bottom = !isNaN(parseFloat(layoutConfig.containerPadding.bottom)) ? layoutConfig.containerPadding.bottom : layoutConfig.containerPadding;
	containerPadding.left = !isNaN(parseFloat(layoutConfig.containerPadding.left)) ? layoutConfig.containerPadding.left : layoutConfig.containerPadding;
	boxSpacing.horizontal = !isNaN(parseFloat(layoutConfig.boxSpacing.horizontal)) ? layoutConfig.boxSpacing.horizontal : layoutConfig.boxSpacing;
	boxSpacing.vertical = !isNaN(parseFloat(layoutConfig.boxSpacing.vertical)) ? layoutConfig.boxSpacing.vertical : layoutConfig.boxSpacing;

	layoutConfig.containerPadding = containerPadding;
	layoutConfig.boxSpacing = boxSpacing;

	// Local
	layoutData._layoutItems = [];
	layoutData._awakeItems = [];
	layoutData._inViewportItems = [];
	layoutData._leadingOrphans = [];
	layoutData._trailingOrphans = [];
	layoutData._containerHeight = layoutConfig.containerPadding.top;
	layoutData._rows = [];
	layoutData._orphans = [];

	// Convert widths and heights to aspect ratios if we need to
	return computeLayout(input.map(function (item) {
		if (item.width && item.width) {
			return { aspectRatio: item.width / item.height };
		} else {
			return { aspectRatio: item };
		}
	}));
};

/**
* Calculate the current layout for all items in the list that require layout.
* "Layout" means geometry: position within container and size
*
* @method computeLayout
* @param itemLayoutData {Array} Array of items to lay out, with data required to lay out each item
* @return {Object} The newly-calculated layout, containing the new container height, and lists of layout items
*/
function computeLayout(itemLayoutData) {

	var notAddedNotComplete,
	    laidOutItems = [],
	    itemAdded,
	    currentRow,
	    nextToLastRowHeight;

	// Apply forced aspect ratio if specified, and set a flag.
	if (layoutConfig.forceAspectRatio) {
		itemLayoutData.forEach(function (itemData) {
			itemData.forcedAspectRatio = true;
			itemData.aspectRatio = layoutConfig.forceAspectRatio;
		});
	}

	// Loop through the items
	itemLayoutData.some(function (itemData, i) {

		notAddedNotComplete = false;

		// If not currently building up a row, make a new one.
		if (!currentRow) {
			currentRow = createNewRow();
		}

		// Attempt to add item to the current row.
		itemAdded = currentRow.addItem(itemData);

		if (currentRow.isLayoutComplete()) {

			// Row is filled; add it and start a new one
			laidOutItems = laidOutItems.concat(addRow(currentRow));
			if (layoutData._rows.length >= layoutConfig.maxNumRows) {
				currentRow = null;
				return true;
			}

			currentRow = createNewRow();

			// Item was rejected; add it to its own row
			if (!itemAdded) {

				itemAdded = currentRow.addItem(itemData);

				if (currentRow.isLayoutComplete()) {

					// If the rejected item fills a row on its own, add the row and start another new one
					laidOutItems = laidOutItems.concat(addRow(currentRow));
					if (layoutData._rows.length >= layoutConfig.maxNumRows) {
						currentRow = null;
						return true;
					}
					currentRow = createNewRow();
				} else if (!itemAdded) {
					notAddedNotComplete = true;
				}
			}
		} else {

			if (!itemAdded) {
				notAddedNotComplete = true;
			}
		}
	});

	// Handle any leftover content (orphans) depending on where they lie
	// in this layout update, and in the total content set.
	if (currentRow && currentRow.getItems().length && layoutConfig.showWidows) {

		// Last page of all content or orphan suppression is suppressed; lay out orphans.
		if (layoutData._rows.length) {

			// Only Match previous row's height if it exists and it isn't a breakout row
			if (layoutData._rows[layoutData._rows.length - 1].isBreakoutRow) {
				nextToLastRowHeight = layoutData._rows[layoutData._rows.length - 1].targetRowHeight;
			} else {
				nextToLastRowHeight = layoutData._rows[layoutData._rows.length - 1].height;
			}

			currentRow.forceComplete(false, nextToLastRowHeight || layoutConfig.targetRowHeight);
		} else {

			// ...else use target height if there is no other row height to reference.
			currentRow.forceComplete(false);
		}

		laidOutItems = laidOutItems.concat(addRow(currentRow));
	}

	// We need to clean up the bottom container padding
	// First remove the height added for box spacing
	layoutData._containerHeight = layoutData._containerHeight - layoutConfig.boxSpacing.vertical;
	// Then add our bottom container padding
	layoutData._containerHeight = layoutData._containerHeight + layoutConfig.containerPadding.bottom;

	return {
		containerHeight: layoutData._containerHeight,
		boxes: layoutData._layoutItems
	};
}

/**
* Create a new, empty row.
*
* @method createNewRow
* @return A new, empty row of the type specified by this layout.
*/
function createNewRow() {

	// Work out if this is a full width breakout row
	if (layoutConfig.fullWidthBreakoutRowCadence !== false) {
		if ((layoutData._rows.length + 1) % layoutConfig.fullWidthBreakoutRowCadence === 0) {
			var isBreakoutRow = true;
		}
	}

	return new Row({
		top: layoutData._containerHeight,
		left: layoutConfig.containerPadding.left,
		width: layoutConfig.containerWidth - layoutConfig.containerPadding.left - layoutConfig.containerPadding.right,
		spacing: layoutConfig.boxSpacing.horizontal,
		targetRowHeight: layoutConfig.targetRowHeight,
		targetRowHeightTolerance: layoutConfig.targetRowHeightTolerance,
		edgeCaseMinRowHeight: 0.5 * layoutConfig.targetRowHeight,
		edgeCaseMaxRowHeight: 2 * layoutConfig.targetRowHeight,
		rightToLeft: false,
		isBreakoutRow: isBreakoutRow
	});
}

/**
 * Add a completed row to the layout.
 * Note: the row must have already been completed.
 *
 * @method addRow
 * @param row {Row} The row to add.
 * @return {Array} Each item added to the row.
 */
function addRow(row) {

	layoutData._rows.push(row);
	layoutData._layoutItems = layoutData._layoutItems.concat(row.getItems());

	// Increment the container height
	layoutData._containerHeight += row.height + layoutConfig.boxSpacing.vertical;

	return row.items;
}