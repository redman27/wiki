/*!
 * VisualEditor UserInterface DiffElement class.
 *
 * @copyright 2011-2020 VisualEditor Team and others; see http://ve.mit-license.org
 * @license The MIT License (MIT); see LICENSE.txt
 */

/**
 * Creates a ve.ui.DiffElement object.
 *
 * @class
 * @extends OO.ui.Element
 *
 * @constructor
 * @param {ve.dm.VisualDiff} [visualDiff] Diff to visualize
 * @param {Object} [config]
 */
ve.ui.DiffElement = function VeUiDiffElement( visualDiff, config ) {
	var diff = visualDiff.diff;

	// Parent constructor
	ve.ui.DiffElement.super.call( this, config );

	this.elementId = 0;

	// Documents
	this.oldDoc = visualDiff.oldDoc;
	this.newDoc = visualDiff.newDoc;
	this.oldDocChildren = visualDiff.oldDocChildren;
	this.newDocChildren = visualDiff.newDocChildren;

	// Merge the old internal list into the new document, so that it knows
	// about removed references
	var tx = ve.dm.TransactionBuilder.static.newFromDocumentInsertion( this.newDoc, 0, this.oldDoc, new ve.Range( 0 ) );
	this.newDoc.commit( tx );

	// Internal list
	this.newDocInternalListNode = visualDiff.newDocInternalListNode;
	this.oldDocInternalListNode = visualDiff.oldDocInternalListNode;

	// Diff
	this.oldToNew = diff.docDiff.oldToNew;
	this.newToOld = diff.docDiff.newToOld;
	this.insert = diff.docDiff.insert;
	this.remove = diff.docDiff.remove;
	this.moves = diff.docDiff.moves;
	this.internalListDiff = diff.internalListDiff;
	this.timedOut = visualDiff.timedOut;

	this.$overlays = $( '<div>' ).addClass( 've-ui-diffElement-overlays' );
	this.$content = $( '<div>' ).addClass( 've-ui-diffElement-content' );
	this.$messages = $( '<div>' ).addClass( 've-ui-diffElement-messages' );
	this.$document = $( '<div>' ).addClass( 've-ui-diffElement-document' );
	this.$sidebar = $( '<div>' ).addClass( 've-ui-diffElement-sidebar' );

	this.descriptions = new ve.ui.ChangeDescriptionsSelectWidget();
	this.descriptions.connect( this, { highlight: 'onDescriptionsHighlight' } );
	// Set to an empty array before a series of diff computations to collect descriptions.
	// Set back to null after collecting values.
	this.descriptionItemsStack = null;

	this.$document.on( {
		mousemove: this.onDocumentMouseMove.bind( this )
	} );

	this.renderDiff();

	if ( this.timedOut ) {
		this.$messages.append(
			this.constructor.static.createWarning( ve.msg( 'visualeditor-diff-timed-out' ) )
		);
	}

	// DOM
	this.$element
		.append(
			this.$overlays,
			this.$messages,
			this.$content.append( this.$document ),
			this.$sidebar.append( this.descriptions.$element )
		)
		.addClass( 've-ui-diffElement' );
};

/* Inheritance */

OO.inheritClass( ve.ui.DiffElement, OO.ui.Element );

/* Static methods */

/**
 * Create a formatted warning message
 *
 * @param {string} msg Warning message text
 * @return {jQuery} Warning message DOM
 */
ve.ui.DiffElement.static.createWarning = function ( msg ) {
	var $warning = $( '<div>' ).addClass( 've-ui-diffElement-warning' ),
		alertIcon = new OO.ui.IconWidget( {
			icon: 'alert',
			flags: [ 'warning' ]
		} );
	return $warning.append( alertIcon.$element, $( '<span>' ).text( msg ) );
};

/**
 * Compare attribute sets between two elements
 *
 * @param {Object} oldAttributes Old attributes
 * @param {Object} newAttributes New attributes
 * @return {Object} Keyed set of attributes
 */
ve.ui.DiffElement.static.compareAttributes = function ( oldAttributes, newAttributes ) {
	function compareKeys( a, b ) {
		if ( typeof a === 'object' && typeof b === 'object' ) {
			return ve.compare( a, b );
		} else {
			return a === b;
		}
	}

	var key,
		attributeChanges = {};
	for ( key in oldAttributes ) {
		if ( !compareKeys( oldAttributes[ key ], newAttributes[ key ] ) ) {
			attributeChanges[ key ] = { from: oldAttributes[ key ], to: newAttributes[ key ] };
		}
	}
	for ( key in newAttributes ) {
		if ( !Object.prototype.hasOwnProperty.call( oldAttributes, key ) && newAttributes[ key ] !== undefined ) {
			attributeChanges[ key ] = { from: oldAttributes[ key ], to: newAttributes[ key ] };
		}
	}
	return attributeChanges;
};

/* Methods */

/**
 * Get a diff element in the document from its elementId
 *
 * @param {number} elementId ID
 * @return {jQuery} Element
 */
ve.ui.DiffElement.prototype.getDiffElementById = function ( elementId ) {
	return this.$document.find( '[data-diff-id=' + elementId + ']' );
};

/**
 * Handle description item hightlight events
 *
 * @param {OO.ui.OptionWidget} item Description item
 */
ve.ui.DiffElement.prototype.onDescriptionsHighlight = function ( item ) {
	if ( this.lastItem ) {
		this.getDiffElementById( this.lastItem.getData() ).css( 'outline', '' );
		this.$overlays.empty();
	}
	if ( item ) {
		var overlayRect = this.$overlays[ 0 ].getBoundingClientRect();
		var elementRects = ve.ce.FocusableNode.static.getRectsForElement( this.getDiffElementById( item.getData() ), overlayRect ).rects;
		for ( var i = 0, l = elementRects.length; i < l; i++ ) {
			this.$overlays.append(
				$( '<div>' ).addClass( 've-ui-diffElement-highlight' ).css( {
					top: elementRects[ i ].top,
					left: elementRects[ i ].left,
					width: elementRects[ i ].width,
					height: elementRects[ i ].height
				} )
			);
		}
		this.lastItem = item;
	}
};

/**
 * Handle document mouse move events
 *
 * @param {jQuery.Event} e Mouse move event
 */
ve.ui.DiffElement.prototype.onDocumentMouseMove = function ( e ) {
	var elementId = $( e.target ).closest( '[data-diff-id]' ).attr( 'data-diff-id' );
	if ( elementId !== undefined ) {
		this.descriptions.highlightItem(
			this.descriptions.findItemFromData( +elementId )
		);
	} else {
		this.descriptions.highlightItem();
	}
};

/**
 * Reposition the description items so they are not above their position in the document
 */
ve.ui.DiffElement.prototype.positionDescriptions = function () {
	var diffElement = this;
	this.descriptions.getItems().forEach( function ( item ) {
		item.$element.css( 'margin-top', '' );

		var itemRect = item.$element[ 0 ].getBoundingClientRect();
		var $element = diffElement.getDiffElementById( item.getData() );
		if ( !$element.length ) {
			// Changed element isn't visible - probably shouldn't happen
			return;
		}
		var elementRect = ve.ce.FocusableNode.static.getRectsForElement( $element ).boundingRect;

		// elementRect can currently be null for meta items, e.g. <link>
		if ( elementRect && elementRect.top > itemRect.top ) {
			item.$element.css( 'margin-top', elementRect.top - itemRect.top - 5 );
		}

	} );
	this.$document.css( 'min-height', this.$sidebar.height() );
};

/**
 * Render the diff
 */
ve.ui.DiffElement.prototype.renderDiff = function () {
	var diffElement = this,
		documentNode = this.$document[ 0 ],
		hasChanges = false,
		diffQueue = [],
		internalListDiffQueue = [];

	function processQueue( queue, parentNode, spacerNode ) {
		var lastItemSpacer = false,
			needsSpacer = false,
			headingContext = null,
			headingContextSpacer = false;

		var elements;

		function isUnchanged( item ) {
			return !item || ( item[ 2 ] === 'none' && !item[ 3 ] );
		}

		function addSpacer() {
			parentNode.appendChild(
				parentNode.ownerDocument.adoptNode( spacerNode.cloneNode( true ) )
			);
			lastItemSpacer = true;
		}

		function render( item ) {
			elements = diffElement[ item[ 0 ] ].apply( diffElement, item.slice( 1 ) );
			while ( elements.length ) {
				parentNode.appendChild(
					parentNode.ownerDocument.adoptNode( elements[ 0 ] )
				);
				elements.shift();
			}
			lastItemSpacer = false;
		}

		function isHeading( item ) {
			switch ( item[ 0 ] ) {
				case 'getNodeElements':
					return item[ 1 ] instanceof ve.dm.HeadingNode;
				case 'getChangedNodeElements':
					return diffElement.newDocChildren[ diffElement.oldToNew[ item[ 1 ] ].node ] instanceof ve.dm.HeadingNode;
			}
		}

		for ( var k = 0, klen = queue.length; k < klen; k++ ) {
			if (
				!isUnchanged( queue[ k - 1 ] ) ||
				!isUnchanged( queue[ k ] ) ||
				!isUnchanged( queue[ k + 1 ] )
			) {
				hasChanges = true;
				if ( headingContext ) {
					// Don't render headingContext if current or next node is a heading
					if ( !isHeading( queue[ k ] ) && !isHeading( queue[ k + 1 ] ) ) {
						if ( headingContextSpacer ) {
							addSpacer();
						}
						render( headingContext );
					} else if ( isHeading( queue[ k + 1 ] ) ) {
						// Skipping the context header becuase the next node is a heading
						// so reinstate the spacer.
						needsSpacer = true;
					}
					headingContext = null;
				}
				if ( needsSpacer && !lastItemSpacer ) {
					addSpacer();
					needsSpacer = false;
				}
				render( queue[ k ] );

				if ( isHeading( queue[ k ] ) ) {
					// Heading was rendered, no need to show it as context
					headingContext = null;
				}
			} else {
				// Heading skipped, maybe show as context later
				if ( isHeading( queue[ k ] ) ) {
					headingContext = isUnchanged( queue[ k ] ) ? queue[ k ] : null;
					headingContextSpacer = needsSpacer;
					needsSpacer = false;
				} else {
					needsSpacer = true;
				}
			}
		}

		// Trailing spacer
		if ( needsSpacer && !lastItemSpacer ) {
			addSpacer();
		}

		return elements;
	}

	var documentSpacerNode = document.createElement( 'div' );
	documentSpacerNode.setAttribute( 'class', 've-ui-diffElement-spacer' );
	documentSpacerNode.appendChild( document.createTextNode( '???' ) );

	// Wrap iternal list spacer in <ol> to match indentation
	var internalListSpacerNode = document.createElement( 'ol' );
	internalListSpacerNode.setAttribute( 'class', 've-ui-diffElement-internalListSpacer' );
	var li = document.createElement( 'li' );
	internalListSpacerNode.appendChild( li );
	li.appendChild( documentSpacerNode.cloneNode( true ) );

	var group;
	var move;
	var i, ilen;
	var referencesListDiffs = {};
	for ( group in this.internalListDiff ) {

		var referencesListDiffDiv = document.createElement( 'div' );

		var internalListGroup = this.internalListDiff[ group ];

		for ( i = 0, ilen = internalListGroup.length; i < ilen; i++ ) {
			var internalListItem = internalListGroup[ i ];

			if ( internalListItem.diff === 1 ) {

				internalListDiffQueue.push( [ 'getInternalListNodeElements', internalListItem, 'insert', null ] );

			} else if ( internalListItem.diff === -1 ) {

				internalListDiffQueue.push( [ 'getInternalListNodeElements', internalListItem, 'remove', null ] );

			} else if ( internalListItem.diff === 0 ) {

				move = internalListGroup.moves[ i ] === 0 ? null : internalListGroup.moves[ i ];
				internalListDiffQueue.push( [ 'getInternalListNodeElements', internalListItem, 'none', move ] );

			} else {

				move = internalListGroup.moves[ i ] === 0 ? null : internalListGroup.moves[ i ];
				internalListDiffQueue.push( [ 'getInternalListChangedNodeElements', internalListItem, move ] );

			}
		}

		this.descriptionItemsStack = [];
		processQueue( internalListDiffQueue, referencesListDiffDiv, internalListSpacerNode );
		referencesListDiffs[ group ] = {
			element: referencesListDiffDiv,
			action: internalListGroup.changes ? 'change' : 'none',
			descriptionItemsStack: this.descriptionItemsStack,
			shown: false
		};
		this.descriptionItemsStack = null;

		internalListDiffQueue = [];
	}

	ilen = Math.max( this.oldDocChildren.length, this.newDocChildren.length );
	var jlen = ilen;

	this.descriptionItemsStack = [];
	var j;
	var referencesListDiff;
	for ( i = 0, j = 0; i < ilen || j < jlen; i++, j++ ) {

		move = this.moves[ j ] === 0 ? null : this.moves[ j ];

		if ( this.oldDocChildren[ i ] === undefined ) {

			// Everything else in the new doc is an insert
			while ( j < this.newDocChildren.length ) {
				diffQueue.push( [ 'getNodeElements', this.newDocChildren[ j ], 'insert', null ] );
				j++;
			}

		} else if ( this.newDocChildren[ j ] === undefined ) {

			// Everything else in the old doc is a remove
			while ( i < this.oldDocChildren.length ) {
				diffQueue.push( [ 'getNodeElements', this.oldDocChildren[ i ], 'remove', null ] );
				i++;
			}

		} else if ( this.remove.indexOf( i ) !== -1 ) {

			// The old node is a remove. Decrement the new node index
			// to compare the same new node to the next old node
			diffQueue.push( [ 'getNodeElements', this.oldDocChildren[ i ], 'remove', null ] );
			j--;

		} else if ( this.insert.indexOf( j ) !== -1 ) {

			// The new node is an insert. Decrement the old node index
			// to compare the same old node to the next new node
			diffQueue.push( [ 'getNodeElements', this.newDocChildren[ j ], 'insert', null ] );
			i--;

		} else if (
			this.newDocChildren[ j ].type === 'mwReferencesList' &&
			( referencesListDiff = referencesListDiffs[ this.newDocChildren[ j ].element.attributes.listGroup ] )
		) {

			// New node is a references list node. If a reference has
			// changed, the references list nodes appear unchanged,
			// because of how the internal list works. However, we
			// already have the HTML for the diffed references list,
			// (which contains details of changes if there are any) so
			// just get that.
			diffQueue.push( [ 'getRefListNodeElements', referencesListDiff.element, referencesListDiff.action, move, referencesListDiff.descriptionItemsStack ] );
			referencesListDiff.shown = true;

		} else if ( typeof this.newToOld[ j ] === 'number' ) {

			// The old and new node are exactly the same
			diffQueue.push( [ 'getNodeElements', this.newDocChildren[ j ], 'none', move ] );

		} else {

			// The new node is modified from the old node
			diffQueue.push( [ 'getChangedNodeElements', this.newToOld[ j ].node, move ] );

		}
	}

	// Show any ref list diffs that weren't picked up by the main diff loop above,
	// e.g. during a section diff.
	for ( group in referencesListDiffs ) {
		referencesListDiff = referencesListDiffs[ group ];
		if ( !referencesListDiff.shown ) {
			diffQueue.push( [ 'getRefListNodeElements', referencesListDiff.element, referencesListDiff.action, move, referencesListDiff.descriptionItemsStack ] );
		}
	}

	processQueue( diffQueue, documentNode, documentSpacerNode );
	this.descriptions.addItems( this.descriptionItemsStack );
	this.descriptionItemsStack = null;

	ve.resolveAttributes( documentNode, this.newDoc.getHtmlDocument(), ve.dm.Converter.static.computedAttributes );

	if ( !hasChanges ) {
		var noChanges = document.createElement( 'div' );
		noChanges.setAttribute( 'class', 've-ui-diffElement-no-changes' );
		noChanges.appendChild( document.createTextNode( ve.msg( 'visualeditor-diff-no-changes' ) ) );
		documentNode.innerHTML = '';
		documentNode.appendChild( noChanges );
	}

	this.$element
		.toggleClass( 've-ui-diffElement-hasDescriptions', !this.descriptions.isEmpty() );
};

/**
 * Get the HTML for the diff of a removed, inserted, or unchanged-but-moved node.
 *
 * @param {ve.dm.Node} node The node being diffed. Will be from the old
 * document if it has been removed, or the new document if it has been inserted
 * or moved
 * @param {string} action 'remove', 'insert' or, if moved, 'none'
 * @param {string|null} move 'up' or 'down' if the node has moved
 * @return {HTMLElement[]} Elements (not owned by window.document)
 */
ve.ui.DiffElement.prototype.getNodeElements = function ( node, action, move ) {
	var nodeDoc = action === 'remove' ? this.oldDoc : this.newDoc;

	var nodeData = this.getNodeData( node, action, move );
	var documentSlice = nodeDoc.cloneWithData( nodeData );

	var doc = ve.dm.converter.getDomFromModel( documentSlice, ve.dm.Converter.static.PREVIEW_MODE );
	var body = doc.body;

	if ( action !== 'none' ) {
		var element = doc.createElement( 'div' );
		element.setAttribute( 'class', 've-ui-diffElement-doc-child-change' );

		if ( node.canContainContent() ) {
			var actionElement = action === 'remove' ? doc.createElement( 'del' ) : doc.createElement( 'ins' );
			while ( body.childNodes[ 0 ].childNodes.length ) {
				actionElement.appendChild( body.childNodes[ 0 ].childNodes[ 0 ] );
			}
			body.childNodes[ 0 ].appendChild( actionElement );
		}

		while ( body.childNodes.length ) {
			element.appendChild( body.childNodes[ 0 ] );
		}
		return [ element ];
	}

	// Convert NodeList to real array
	return Array.prototype.slice.call( body.childNodes );
};

/**
 * Get the DOM from linear data and wrap it for the diff.
 *
 * @param {Array} nodeData Linear data for the diff
 * @return {HTMLElement[]} Elements (not owned by window.document)
 */
ve.ui.DiffElement.prototype.wrapNodeData = function ( nodeData ) {
	var element = document.createElement( 'div' );

	var documentSlice = this.newDoc.cloneWithData( nodeData );
	documentSlice.getStore().merge( this.newDoc.getStore() );
	var nodeElements = ve.dm.converter.getDomFromModel( documentSlice, ve.dm.Converter.static.PREVIEW_MODE ).body;

	element.setAttribute( 'class', 've-ui-diffElement-doc-child-change' );

	while ( nodeElements.childNodes.length ) {
		element.appendChild(
			element.ownerDocument.adoptNode( nodeElements.childNodes[ 0 ] )
		);
	}

	return [ element ];
};

/**
 * Get the linear data for the diff of a removed, inserted, or
 * unchanged-but-moved node.
 *
 * @param {ve.dm.Node} node
 * @param {string} action  'remove', 'insert' or, if moved, 'none'
 * @param {string|null} move 'up' or 'down' if the node has moved
 * @return {Array} Linear Data
 */
ve.ui.DiffElement.prototype.getNodeData = function ( node, action, move ) {
	var doc = action === 'remove' ? this.oldDoc : this.newDoc;

	// Get the linear model for the node
	var nodeData = doc.getData( node.getOuterRange() );

	// Add the classes to the outer element
	this.addAttributesToElement( nodeData, 0, { 'data-diff-action': action } );
	this.markMove( move, nodeData );

	return nodeData;
};

/**
 * Get the HTML for the diff of a node that has been changed.
 *
 * @param {number} oldNodeIndex Index of the old node
 * @param {string|null} move 'up' or 'down' if the node has moved
 * @return {HTMLElement[]} Elements (not owned by window.document)
 */
ve.ui.DiffElement.prototype.getChangedNodeElements = function ( oldNodeIndex, move ) {
	var oldNode = this.oldDocChildren[ oldNodeIndex ],
		newNode = this.newDocChildren[ this.oldToNew[ oldNodeIndex ].node ],
		diff = this.oldToNew[ oldNodeIndex ].diff;

	var nodeData = this.getChangedNodeData( diff, move, newNode, oldNode );

	return this.wrapNodeData( nodeData, move );
};

/**
 * Get the linear data for the diff of a node that has been changed.
 *
 * @param {Object} diff Object describing the diff
 * @param {string|null} move 'up' or 'down' if the node has moved
 * @param {ve.dm.Node} newNode Corresponding node from the new document
 * @param {ve.dm.Node} [oldNode] Node from the old document
 * @return {Array} Linear data for the diff
 */
ve.ui.DiffElement.prototype.getChangedNodeData = function ( diff, move, newNode, oldNode ) {
	var nodeData;

	// Choose the appropriate method for the type of node
	if ( newNode.isDiffedAsLeaf() ) {
		nodeData = this.getChangedLeafNodeData( newNode, diff, move );
	} else if ( newNode.isDiffedAsList() ) {
		nodeData = this.getChangedListNodeData( newNode, diff );
	} else {
		nodeData = this.getChangedTreeNodeData( oldNode, newNode, diff );
	}

	this.markMove( move, nodeData );

	return nodeData;
};

/**
 * Get the linear data for the diff of a leaf-like node that has been changed.
 *
 * @param {ve.dm.Node} newNode Corresponding node from the new document
 * @param {Object} diff Object describing the diff
 * @return {Array} Linear data for the diff
 */
ve.ui.DiffElement.prototype.getChangedLeafNodeData = function ( newNode, diff ) {
	var nodeRange = newNode.getOuterRange(),
		nodeData = this.newDoc.getData( nodeRange ),
		linearDiff = diff.linearDiff,
		attributeChange = diff.attributeChange;

	if ( linearDiff ) {
		// If there is a content change, splice it in
		var nodeDiffData = linearDiff;
		var annotatedData = this.annotateNode( nodeDiffData );
		ve.batchSplice( nodeData, 1, newNode.length, annotatedData );
	}
	if ( attributeChange ) {
		// If there is no content change, just add change class
		this.addAttributesToElement(
			nodeData, 0, { 'data-diff-action': 'structural-change' }
		);
		var item = this.compareNodeAttributes( nodeData, 0, this.newDoc, attributeChange );
		if ( item ) {
			this.descriptionItemsStack.push( item );
		}
	}

	return nodeData;
};

/**
 * Append list item
 *
 * @private
 * @param {Array} diffData
 * @param {number} insertIndex
 * @param {ve.dm.ListNode} listNode
 * @param {Array} listNodeData
 * @param {Array} listItemData
 * @param {number} depthChange
 * @return {number}
 */
ve.ui.DiffElement.prototype.appendListItem = function ( diffData, insertIndex, listNode, listNodeData, listItemData, depthChange ) {
	if ( depthChange === 0 ) {

		// Current list item belongs to the same list as the previous list item
		ve.batchSplice( diffData, insertIndex, 0, listItemData );
		insertIndex += listItemData.length;

	} else if ( depthChange > 0 ) {

		// Begin a new nested list, with this node's ancestor nodes
		var linearData = [];
		linearData.unshift( listNodeData[ 0 ] );

		var k, klen;
		// Nested list may be nested by multiple levels
		for ( k = 0, klen = depthChange - 1; k < klen; k++ ) {
			var listItemNode = listNode.parent;
			linearData.unshift( this.newDoc.data.data[ listItemNode.getOuterRange().from ] );
			listNode = listItemNode.parent;
			linearData.unshift( this.newDoc.data.data[ listNode.getOuterRange().from ] );
		}

		// Splice in the content, and splice that into the diff data
		ve.batchSplice( linearData, linearData.length, 0, listItemData );
		for ( k = 0, klen = depthChange - 1; k < klen; k++ ) {
			linearData.push( { type: '/list' } );
			linearData.push( { type: '/listItem' } );
		}
		linearData.push( { type: '/list' } );

		// Splice into previous list item
		insertIndex -= 1;
		ve.batchSplice( diffData, insertIndex, 0, linearData );

		// Adjust the insertIndex to be at the end of this content
		insertIndex += 2 * ( depthChange - 1 ) + 1 + listItemData.length;

	} else if ( depthChange < 0 ) {

		// Skip over close elements to get out of nested list(s)
		insertIndex += 2 * -depthChange;

		// Splice in the data and adjust the insert index
		ve.batchSplice( diffData, insertIndex, 0, listItemData );
		insertIndex += listItemData.length;
	}

	return insertIndex;
};

/**
 * Get the linear data for the diff of a list-like node that has been changed.
 *
 * @param {ve.dm.Node} newNode Corresponding node from the new document
 * @param {Object} diff Object describing the diff
 * @return {Array} Linear data for the diff
 */
ve.ui.DiffElement.prototype.getChangedListNodeData = function ( newNode, diff ) {
	var nodeRange = newNode.getOuterRange(),
		diffData = this.newDoc.getData( nodeRange ),
		oldNodes = diff.oldList,
		newNodes = diff.newList;

	// Keep only the root list node
	ve.batchSplice( diffData, 1, diffData.length - 2, [] );

	// These will be adjusted for each item
	var insertIndex = 1;
	var depth = 0;

	// Splice in each item with its diff annotations
	for ( var i = 0, ilen = diff.length; i < ilen; i++ ) {

		var item = diff[ i ];
		var nodes = newNodes;
		var doc = this.newDoc;

		var contentData;
		if ( typeof item.diff === 'number' ) {

			// Item is removed, inserted or unchanged
			var action = item.diff === 0 ? 'none' : ( item.diff === -1 ? 'remove' : 'insert' );

			// Choose the appropriate nodes and document for the action
			if ( action === 'remove' ) {
				nodes = oldNodes;
				doc = this.oldDoc;
			}

			// Get the linear data for the list item's content
			contentData = this.getNodeData( nodes.nodes[ item.indexOrder ], action, diff.moves[ i ] || null );

		} else {

			// Item is changed. Get the linear data for the diff
			contentData = this.getChangedNodeData(
				{
					linearDiff: item.diff.linearDiff,
					attributeChange: item.diff.attributeChange.depthChange
				},
				diff.moves[ i ] || null,
				newNodes.nodes[ item.indexOrder ]
			);

		}

		// Calculate the change in depth
		var newDepth = nodes.metadata[ item.indexOrder ].depth;
		var depthChange = newDepth - depth;

		// Get linear data. Also get list node, since may need ancestors
		var listNode = nodes.metadata[ item.indexOrder ].listNode;
		var listNodeData = [ doc.getData( listNode.getOuterRange() )[ 0 ] ];
		var listItemData = doc.getData( nodes.metadata[ item.indexOrder ].listItem.getOuterRange() );
		ve.batchSplice( listItemData, 1, listItemData.length - 2, contentData );

		// Check for attribute changes
		if ( item.diff.attributeChange ) {
			var change;
			if ( item.diff.attributeChange.listNodeAttributeChange ) {
				change = this.compareNodeAttributes(
					listNodeData,
					0,
					this.newDoc,
					item.diff.attributeChange.listNodeAttributeChange
				);
				if ( change ) {
					this.descriptionItemsStack.push( change );
				}
			}
			if ( item.diff.attributeChange.listItemAttributeChange ) {
				change = this.compareNodeAttributes(
					listItemData,
					0,
					this.newDoc,
					item.diff.attributeChange.listItemAttributeChange
				);
				if ( change ) {
					this.descriptionItemsStack.push( change );
				}
			}
		}

		// Record the index to splice in the next list item data into the diffData
		insertIndex = this.appendListItem(
			diffData, insertIndex, listNode, listNodeData, listItemData, depthChange
		);
		depth = newDepth;
	}

	return diffData;
};

/**
 * Get the linear data for the diff of a tree-like node that has been changed.
 * Any node that is not leaf-like or list-like is treated as tree-like.
 *
 * @param {ve.dm.Node} oldNode Node from the old document
 * @param {ve.dm.Node} newNode Corresponding node from the new document
 * @param {Object} diff Object describing the diff
 * @return {Array} Linear data for the diff
 */
ve.ui.DiffElement.prototype.getChangedTreeNodeData = function ( oldNode, newNode, diff ) {
	var nodeRange = newNode.getOuterRange(),
		nodeData = this.newDoc.getData( nodeRange ),
		treeDiff = diff.treeDiff,
		diffInfo = diff.diffInfo,
		oldNodes = diff.oldTreeOrderedNodes,
		newNodes = diff.newTreeOrderedNodes,
		correspondingNodes = diff.correspondingNodes,
		structuralRemoves = [],
		highestRemovedAncestors = {};

	/**
	 * Splice in the removed data for the subtree rooted at this node, from the old
	 * document.
	 *
	 * @param {number} nodeIndex The index of this node in the subtree rooted at
	 * this document child
	 */
	function highlightRemovedNode( nodeIndex ) {
		var x, xlen, orderedNode, node, removeData, siblingNodes,
			newPreviousNodeIndex, oldPreviousNodeIndex, insertIndex,
			highestRemovedAncestor;

		function findRemovedAncestor( n ) {
			if ( !n.parent || structuralRemoves.indexOf( n.parent.index ) === -1 ) {
				return n.index;
			} else {
				return findRemovedAncestor( n.parent );
			}
		}

		function getRemoveData( n, index ) {
			var data, tempData;

			data = this.oldDoc.getData( n.node.getOuterRange() );
			this.addAttributesToElement( data, 0, {
				'data-diff-action': 'remove'
			} );

			while ( n && n.index !== index ) {
				n = n.parent;
				tempData = this.oldDoc.getData( n.node.getOuterRange() );
				data.unshift( tempData[ 0 ] );
				data.push( tempData[ tempData.length - 1 ] );
				this.addAttributesToElement( data, 0, {
					'data-diff-action': 'structural-remove'
				} );
			}

			return data;
		}

		orderedNode = oldNodes[ nodeIndex ];
		node = orderedNode.node;

		if ( !node.canContainContent() && node.hasChildren() ) {

			// Record that the node has been removed, but don't display it, for now
			// TODO: describe the change for the attribute diff
			structuralRemoves.push( nodeIndex );

		} else {

			// Display the removed node, and all its ancestors, up to the first ancestor that
			// hasn't been removed.
			highestRemovedAncestor = oldNodes[ findRemovedAncestor( orderedNode ) ];
			removeData = getRemoveData.call( this, orderedNode, highestRemovedAncestor.index );

			// Work out where to insert the removed subtree
			if ( highestRemovedAncestor.index in highestRemovedAncestors ) {

				// The highest removed ancestor has already been spliced into nodeData, so remove
				// it from this subtree and splice the rest of this subtree in
				removeData.shift();
				removeData.pop();
				insertIndex = highestRemovedAncestors[ highestRemovedAncestor.index ];

			} else if ( !highestRemovedAncestor.parent ) {

				// If this node is a child of the document node, then it won't have a "previous
				// node" (see below), in which case, insert it just before its corresponding
				// node in the new document.
				insertIndex = newNodes[ correspondingNodes.oldToNew[ highestRemovedAncestor.index ] ]
					.node.getOuterRange().from - nodeRange.from;

			} else {

				// Find the node that corresponds to the "previous node" of this node. The
				// "previous node" is either:
				// - the rightmost left sibling that corresponds to a node in the new document
				// - or if there isn't one, then this node's parent (which must correspond to
				// a node in the new document, or this node would have been marked already
				// processed)
				siblingNodes = highestRemovedAncestor.parent.children;
				for ( x = 0, xlen = siblingNodes.length; x < xlen; x++ ) {
					if ( siblingNodes[ x ].index === highestRemovedAncestor.index ) {
						break;
					} else {
						oldPreviousNodeIndex = siblingNodes[ x ].index;
						newPreviousNodeIndex = correspondingNodes.oldToNew[ oldPreviousNodeIndex ] || newPreviousNodeIndex;
					}
				}

				// If previous node was found among siblings, insert the removed subtree just
				// after its corresponding node in the new document. Otherwise insert the
				// removed subtree just inside its parent node's corresponding node.
				if ( newPreviousNodeIndex ) {
					insertIndex = newNodes[ newPreviousNodeIndex ].node.getOuterRange().to - nodeRange.from;
				} else {
					newPreviousNodeIndex = correspondingNodes.oldToNew[ highestRemovedAncestor.parent.index ];
					insertIndex = newNodes[ newPreviousNodeIndex ].node.getRange().from - nodeRange.from;
				}

				// If more content branch node descendants of the highest removed node have
				// also been removed, record the index where their subtrees will need to be
				// spliced in.
				highestRemovedAncestors[ highestRemovedAncestor.index ] = insertIndex + 1;

			}

			ve.batchSplice( nodeData, insertIndex, 0, removeData );
		}
	}

	/**
	 * Mark this node as inserted.
	 *
	 * @param {number} nodeIndex The index of this node in the subtree rooted at
	 * this document child
	 */
	function highlightInsertedNode( nodeIndex ) {
		var node, nodeRangeStart;

		// Find index of first data element for this node
		node = newNodes[ nodeIndex ].node;
		nodeRangeStart = node.getOuterRange().from - nodeRange.from;

		// Add insert class
		this.addAttributesToElement(
			nodeData, nodeRangeStart, {
				'data-diff-action': ( !node.canContainContent() && node.hasChildren() ) ? 'structural-insert' : 'insert'
			}
		);
	}

	/**
	 * Mark this node as changed and, if it is a content branch node, splice in
	 * the diff data.
	 *
	 * @param {number} nodeIndex The index of this node in the subtree rooted at
	 * this document child
	 * @param {Object} info Information relating to this node's change
	 */
	function highlightChangedNode( nodeIndex, info ) {
		var node, nodeRangeStart, nodeDiffData, annotatedData, item;

		// The new node was changed.
		// Get data for this node
		node = newNodes[ nodeIndex ].node;
		nodeRangeStart = node.getOuterRange().from - nodeRange.from;

		if ( info.linearDiff ) {
			// If there is a content change, splice it in
			nodeDiffData = info.linearDiff;
			annotatedData = this.annotateNode( nodeDiffData );
			ve.batchSplice( nodeData, nodeRangeStart + 1, node.length, annotatedData );
		}
		if ( info.attributeChange ) {
			// If there is no content change, just add change class
			this.addAttributesToElement(
				nodeData, nodeRangeStart, { 'data-diff-action': 'structural-change' }
			);
			item = this.compareNodeAttributes( nodeData, nodeRangeStart, this.newDoc, info.attributeChange );
			if ( item ) {
				this.descriptionItemsStack.push( item );
			}
		}
	}

	// Iterate backwards over trees so that changes are made from right to left
	// of the data, to avoid having to update ranges
	var ilen = Math.max( oldNodes.length, newNodes.length );
	var jlen = ilen;
	for ( var i = 0, j = 0; i < ilen && j < jlen; i++, j++ ) {

		var newIndex = newNodes.length - 1 - i;
		var oldIndex = oldNodes.length - 1 - j;

		if ( newIndex < 0 ) {

			// The rest of the nodes have been removed
			highlightRemovedNode.call( this, oldIndex );

		} else if ( oldIndex < 0 ) {

			// The rest of the nodes have been inserted
			highlightInsertedNode.call( this, newIndex );

		} else if ( correspondingNodes.newToOld[ newIndex ] === oldIndex ) {

			// The new node was changed.
			for ( var k = 0, klen = treeDiff.length; k < klen; k++ ) {
				if ( treeDiff[ k ][ 0 ] === oldIndex && treeDiff[ k ][ 1 ] === newIndex ) {

					if ( !diffInfo[ k ] ) {

						// We are treating these nodes as removed and inserted
						highlightInsertedNode.call( this, newIndex );
						highlightRemovedNode.call( this, oldIndex );

					} else {

						// There could be any combination of content, attribute and type changes
						highlightChangedNode.call( this, newIndex, diffInfo[ k ] );

					}

				}
			}

		} else if ( correspondingNodes.newToOld[ newIndex ] === undefined ) {

			// The new node was inserted.
			highlightInsertedNode.call( this, newIndex );
			j--;

		} else if ( correspondingNodes.newToOld[ newIndex ] < oldIndex ) {

			// The old node was removed.
			highlightRemovedNode.call( this, oldIndex );
			i--;

		}
	}

	// Push new description items from the queue
	this.descriptions.addItems( this.descriptionItemsStack );
	this.descriptionItemsStack = [];

	return nodeData;
};

/**
 * Add the relevant attributes to references list node HTML, whether changed or
 * unchanged (but not inserted or removed - in these cases we just use
 * getNodeElements).
 *
 * @param {HTMLElement} referencesListDiffDiv Div containing the references list
 * @param {string} action 'change' or 'none'
 * @param {string} move 'up' or 'down' if the node has moved
 * @param {OO.ui.OptionWidget[]} items Change descriptions for the reference list
 * @return {HTMLElement[]} Elements to display
 */
ve.ui.DiffElement.prototype.getRefListNodeElements = function ( referencesListDiffDiv, action, move, items ) {
	if ( action !== 'none' ) {
		referencesListDiffDiv.setAttribute( 'class', 've-ui-diffElement-doc-child-change' );
	}
	this.markMove( move, referencesListDiffDiv );
	this.descriptionItemsStack.push.apply( this.descriptionItemsStack, items );

	return [ referencesListDiffDiv ];
};

/**
 * Get the HTML for the diff of a single internal list item that has been removed
 * from the old document, inserted into the new document, or that is unchanged.
 *
 * @param {Object} internalListItem Information about the internal list item's diff
 * @param {string} action 'remove', 'insert' or 'none'
 * @param {string|null} move 'up' or 'down' if the node has moved
 * @return {HTMLElement[]} Elements (not owned by window.document)
 */
ve.ui.DiffElement.prototype.getInternalListNodeElements = function ( internalListItem, action, move ) {
	var internalListNode = action === 'remove' ? this.oldDocInternalListNode : this.newDocInternalListNode,
		node = internalListNode.children[ internalListItem.nodeIndex ].children[ 0 ],
		listNode = document.createElement( 'ol' ),
		listItemNode = document.createElement( 'li' );

	if ( node && node.length ) {
		var elements = this.getNodeElements( node, action, move );

		listItemNode.appendChild(
			listItemNode.ownerDocument.adoptNode( elements[ 0 ] )
		);
	} else {
		// TODO: This is MW-Cite-specific behaviour that VE core
		// should know nothing about. Move to MWDiffElement?
		$( listItemNode ).append(
			$( '<span>' )
				.addClass( 've-ce-mwReferencesListNode-muted' )
				.text( ve.msg( 'cite-ve-referenceslist-missingref-in-list' ) )
		).attr( 'data-diff-action', action );
	}
	listNode.setAttribute( 'start', internalListItem.indexOrder + 1 );
	listNode.appendChild( listItemNode );

	return [ listNode ];
};

/**
 * Get the HTML for the linear diff of a single internal list item that has changed
 * from the old document to the new document.
 *
 * @param {Object} internalListItem Information about the internal list item's diff
 * @param {string|null} move 'up' or 'down' if the node has moved
 * @return {HTMLElement[]} HTML elements to display the linear diff
 */
ve.ui.DiffElement.prototype.getInternalListChangedNodeElements = function ( internalListItem, move ) {
	var listNode = document.createElement( 'ol' ),
		listItemNode = document.createElement( 'li' ),
		linearDiff = internalListItem.diff.diffInfo[ 0 ].linearDiff,
		annotatedData = this.annotateNode( linearDiff );

	var element = document.createElement( 'div' );
	element.setAttribute( 'class', 've-ui-diffElement-doc-child-change' );
	this.markMove( move, element );
	var documentSlice = this.newDoc.cloneWithData( annotatedData, true, true );
	var body = ve.dm.converter.getDomFromModel( documentSlice, ve.dm.Converter.static.PREVIEW_MODE ).body;
	while ( body.childNodes.length ) {
		element.appendChild(
			element.ownerDocument.adoptNode( body.childNodes[ 0 ] )
		);
	}

	listItemNode.appendChild(
		listItemNode.ownerDocument.adoptNode( element )
	);

	listNode.setAttribute( 'start', internalListItem.indexOrder + 1 );
	listNode.appendChild( listItemNode );

	return [ listNode ];
};

/**
 * Compare attributes of two nodes
 *
 * @param {Array} data Linear data containing new node
 * @param {number} offset Offset in data
 * @param {ve.dm.Document} doc Document model
 * @param {Object} attributeChange Attribute change object containing oldAttributes and newAttributes
 * @return {OO.ui.OptionWidget|null} Change description item, or null if nothing to describe
 */
ve.ui.DiffElement.prototype.compareNodeAttributes = function ( data, offset, doc, attributeChange ) {
	var attributeChanges = this.constructor.static.compareAttributes( attributeChange.oldAttributes, attributeChange.newAttributes );

	var changes = ve.dm.modelRegistry.lookup( data[ offset ].type ).static.describeChanges( attributeChanges, attributeChange.newAttributes, data[ offset ] );

	// Don't describe the same change twice
	if ( changes.length && (
		!( data[ offset ].internal ) ||
		!( data[ offset ].internal.diff ) ||
		data[ offset ].internal.diff[ 'data-diff-id' ] === undefined )
	) {
		var item = this.getChangeDescriptionItem( changes );
		this.addAttributesToElement( data, offset, { 'data-diff-id': item.getData() } );
		return item;
	}

	return null;
};

/**
 * Get a change description item from a set of changes
 *
 * @param {Array} changes List of changes, each change being either text or a Node array
 * @param {Array} classes Additional classes
 * @return {OO.ui.OptionWidget} Change description item
 */
ve.ui.DiffElement.prototype.getChangeDescriptionItem = function ( changes, classes ) {
	var elementId = this.elementId,
		$label = $( [] );

	for ( var i = 0, l = changes.length; i < l; i++ ) {
		var $change = $( '<div>' );
		if ( typeof changes[ i ] === 'string' ) {
			$change.text( changes[ i ] );
		} else {
			$change.append( changes[ i ] );
		}
		$label = $label.add( $change );
	}
	// eslint-disable-next-line mediawiki/class-doc
	var item = new OO.ui.OptionWidget( {
		label: $label,
		data: elementId,
		classes: [ 've-ui-diffElement-attributeChange' ].concat( classes || [] )
	} );
	this.elementId++;
	return item;
};

/**
 * Mark an element with attributes to be added later by the converter.
 *
 * @param {Array} data Data containing element to be marked
 * @param {number} offset Offset of element to be marked
 * @param {Object} attributes Attributes to set
 */
ve.ui.DiffElement.prototype.addAttributesToElement = function ( data, offset, attributes ) {
	var newElement = ve.copy( data[ offset ] );

	// NB we modify the linear data here, but then this is a cloned document.
	for ( var key in attributes ) {
		if ( attributes[ key ] !== undefined ) {
			ve.setProp( newElement, 'internal', 'diff', key, attributes[ key ] );
		}
	}

	// Don't let any nodes get unwrapped
	ve.deleteProp( newElement, 'internal', 'generated' );

	data.splice( offset, 1, newElement );
};

/**
 * Mark an HTML element or data element as moved
 *
 * @param {string|null} move 'up' or 'down' if the node has moved
 * @param {HTMLElement|Array} elementOrData Linear data or HTMLElement
 * @param {number} [offset=0] Linear mode offset
 */
ve.ui.DiffElement.prototype.markMove = function ( move, elementOrData, offset ) {
	if ( !move ) {
		return;
	}
	// The following messages are used here:
	// * visualeditor-diff-moved-up
	// * visualeditor-diff-moved-down
	// The following classes are used here:
	// * ve-ui-diffElement-moved-up
	// * ve-ui-diffElement-moved-down
	var item = this.getChangeDescriptionItem( [ ve.msg( 'visualeditor-diff-moved-' + move ) ], [ 've-ui-diffElement-moved-' + move ] );
	if ( Array.isArray( elementOrData ) ) {
		this.addAttributesToElement( elementOrData, offset || 0, { 'data-diff-move': move, 'data-diff-id': item.getData() } );
	} else {
		elementOrData.setAttribute( 'data-diff-move', move );
		elementOrData.setAttribute( 'data-diff-id', item.getData() );
	}
	this.descriptionItemsStack.push( item );
};

/**
 * Annotate some data to highlight diff
 *
 * @param {Array} linearDiff Linear diff, mapping arrays of linear data to diff
 * actions (remove, insert or retain)
 * @return {Array} Data with annotations added
 */
ve.ui.DiffElement.prototype.annotateNode = function ( linearDiff ) {
	var DIFF_DELETE = ve.DiffMatchPatch.static.DIFF_DELETE,
		DIFF_INSERT = ve.DiffMatchPatch.static.DIFF_INSERT,
		DIFF_CHANGE_DELETE = ve.DiffMatchPatch.static.DIFF_CHANGE_DELETE,
		DIFF_CHANGE_INSERT = ve.DiffMatchPatch.static.DIFF_CHANGE_INSERT,
		items = [],
		start = 0, // The starting index for a range for building an annotation
		end, annotatedLinearDiff,
		domElement, domElements, originalDomElementsHash,
		diffDoc, diffDocData,
		diffElement = this;

	// Make a new document from the diff
	diffDocData = linearDiff[ 0 ][ 1 ];
	var i, ilen;
	for ( i = 1, ilen = linearDiff.length; i < ilen; i++ ) {
		diffDocData = diffDocData.concat( linearDiff[ i ][ 1 ] );
	}
	diffDoc = this.newDoc.cloneWithData( diffDocData );

	// Add spans with the appropriate attributes for removes and inserts
	// TODO: do insert and remove outside of loop
	for ( i = 0; i < ilen; i++ ) {
		end = start + linearDiff[ i ][ 1 ].length;
		if ( start !== end ) {
			var range = new ve.Range( start, end );
			var type = linearDiff[ i ][ 0 ];
			if ( type !== 0 ) {
				var typeAsString, domElementType, annType;
				switch ( type ) {
					case DIFF_DELETE:
						typeAsString = 'remove';
						domElementType = 'del';
						annType = 'textStyle/delete';
						break;
					case DIFF_INSERT:
						typeAsString = 'insert';
						domElementType = 'ins';
						annType = 'textStyle/insert';
						break;
					case DIFF_CHANGE_DELETE:
						typeAsString = 'change-remove';
						domElementType = 'span';
						annType = 'textStyle/span';
						break;
					case DIFF_CHANGE_INSERT:
						typeAsString = 'change-insert';
						domElementType = 'span';
						annType = 'textStyle/span';
						break;
				}
				domElement = document.createElement( domElementType );
				domElement.setAttribute( 'data-diff-action', typeAsString );
				domElements = [ domElement ];

				var changes = [];
				if ( linearDiff[ i ].annotationChanges ) {
					// eslint-disable-next-line no-loop-func
					linearDiff[ i ].annotationChanges.forEach( function ( annotationChange ) {
						var attributeChanges;
						if ( annotationChange.oldAnnotation && annotationChange.newAnnotation ) {
							attributeChanges = diffElement.constructor.static.compareAttributes(
								annotationChange.oldAnnotation.getAttributes(),
								annotationChange.newAnnotation.getAttributes()
							);
							changes = changes.concat( ve.dm.modelRegistry.lookup( annotationChange.newAnnotation.getType() ).static.describeChanges(
								attributeChanges, annotationChange.newAnnotation.getAttributes(), annotationChange.newAnnotation.getElement()
							) );
						} else if ( annotationChange.newAnnotation ) {
							changes = changes.concat( annotationChange.newAnnotation.describeAdded() );
						} else if ( annotationChange.oldAnnotation ) {
							changes = changes.concat( annotationChange.oldAnnotation.describeRemoved() );
						}
					} );
				}
				if ( linearDiff[ i ].attributeChanges ) {
					var element = linearDiff[ i ][ 1 ][ 0 ];
					// eslint-disable-next-line no-loop-func
					linearDiff[ i ].attributeChanges.forEach( function ( attributeChange ) {
						var attributeChanges = diffElement.constructor.static.compareAttributes(
							attributeChange.oldAttributes,
							attributeChange.newAttributes
						);
						changes = changes.concat( ve.dm.modelRegistry.lookup( element.type ).static.describeChanges(
							attributeChanges, element.attributes, element
						) );
					} );
				}
				if ( changes.length ) {
					var item = diffElement.getChangeDescriptionItem( changes );
					domElement.setAttribute( 'data-diff-id', item.getData() );
					items.push( item );
				}

				originalDomElementsHash = diffDoc.getStore().hash(
					domElements,
					domElements.map( ve.getNodeHtml ).join( '' )
				);
				var annHash = diffDoc.getStore().hash(
					ve.dm.annotationFactory.create( annType, {
						type: annType,
						originalDomElementsHash: originalDomElementsHash
					} )
				);

				// Insert annotation above annotations that span the entire range
				// and at least one character more
				var j;
				var annHashLists = [];
				for (
					j = Math.max( 0, range.start - 1 );
					j < Math.min( range.end + 1, diffDoc.data.getLength() );
					j++
				) {
					annHashLists[ j ] =
						diffDoc.data.getAnnotationHashesFromOffset( j );
				}
				var height = Math.min(
					ve.getCommonStartSequenceLength(
						annHashLists.slice(
							Math.max( 0, range.start - 1 ),
							range.end
						)
					),
					ve.getCommonStartSequenceLength(
						annHashLists.slice(
							range.start,
							Math.min( range.end + 1, diffDoc.data.getLength() )
						)
					)
				);
				for ( j = range.start; j < range.end; j++ ) {
					annHashLists[ j ].splice( height, 0, annHash );
					diffDoc.data.setAnnotationHashesAtOffset(
						j,
						annHashLists[ j ]
					);
				}
			}
		}
		start = end;
	}
	this.descriptionItemsStack.push.apply( this.descriptionItemsStack, items );

	// Merge the stores and get the data
	this.newDoc.getStore().merge( diffDoc.getStore() );
	annotatedLinearDiff = diffDoc.getData( { start: 0, end: diffDoc.getLength() } );

	return annotatedLinearDiff;
};
