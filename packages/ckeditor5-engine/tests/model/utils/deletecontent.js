/**
 * @license Copyright (c) 2003-2017, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import Model from '../../../src/model/model';
import Position from '../../../src/model/position';
import Range from '../../../src/model/range';
import Element from '../../../src/model/element';
import deleteContent from '../../../src/model/utils/deletecontent';
import { setData, getData } from '../../../src/dev-utils/model';

describe( 'DataController utils', () => {
	let model, doc;

	describe( 'deleteContent', () => {
		it( 'should use parent batch', () => {
			model = new Model();
			doc = model.document;
			doc.createRoot();

			model.schema.extend( '$text', { allowIn: '$root' } );
			setData( model, 'x[abc]x' );

			model.change( writer => {
				deleteContent( model, doc.selection );
				expect( writer.batch.deltas ).to.length( 1 );
			} );
		} );

		describe( 'in simple scenarios', () => {
			beforeEach( () => {
				model = new Model();
				doc = model.document;
				doc.createRoot();

				const schema = model.schema;

				schema.register( 'image', { allowWhere: '$text' } );
				schema.extend( '$text', { allowIn: '$root' } );
			} );

			test(
				'does nothing on collapsed selection',
				'f[]oo',
				'f[]oo'
			);

			test(
				'deletes single character',
				'f[o]o',
				'f[]o'
			);

			it( 'deletes single character (backward selection)', () => {
				setData( model, 'f[o]o', { lastRangeBackward: true } );

				deleteContent( model, doc.selection );

				expect( getData( model ) ).to.equal( 'f[]o' );
			} );

			test(
				'deletes whole text',
				'[foo]',
				'[]'
			);

			test(
				'deletes whole text between nodes',
				'<image></image>[foo]<image></image>',
				'<image></image>[]<image></image>'
			);

			test(
				'deletes an element',
				'x[<image></image>]y',
				'x[]y'
			);

			test(
				'deletes a bunch of nodes',
				'w[x<image></image>y]z',
				'w[]z'
			);

			test(
				'does not break things when option.merge passed',
				'w[x<image></image>y]z',
				'w[]z'
			);
		} );

		describe( 'with text attributes', () => {
			beforeEach( () => {
				model = new Model();
				doc = model.document;
				doc.createRoot();

				const schema = model.schema;

				schema.register( 'image', { allowWhere: '$text' } );
				schema.register( 'paragraph', { inheritAllFrom: '$block' } );

				schema.extend( '$text', {
					allowIn: '$root',
					allowAttributes: [ 'bold', 'italic' ]
				} );
			} );

			it( 'deletes characters (first half has attrs)', () => {
				setData( model, '<$text bold="true">fo[o</$text>b]ar' );

				deleteContent( model, doc.selection );

				expect( getData( model ) ).to.equal( '<$text bold="true">fo[]</$text>ar' );
				expect( doc.selection.getAttribute( 'bold' ) ).to.equal( true );
			} );

			it( 'deletes characters (2nd half has attrs)', () => {
				setData( model, 'fo[o<$text bold="true">b]ar</$text>' );

				deleteContent( model, doc.selection );

				expect( getData( model ) ).to.equal( 'fo[]<$text bold="true">ar</$text>' );
				expect( doc.selection.getAttribute( 'bold' ) ).to.undefined;
			} );

			it( 'clears selection attrs when emptied content', () => {
				setData( model, '<paragraph>x</paragraph><paragraph>[<$text bold="true">foo</$text>]</paragraph><paragraph>y</paragraph>' );

				deleteContent( model, doc.selection );

				expect( getData( model ) ).to.equal( '<paragraph>x</paragraph><paragraph>[]</paragraph><paragraph>y</paragraph>' );
				expect( doc.selection.getAttribute( 'bold' ) ).to.undefined;
			} );

			it( 'leaves selection attributes when text contains them', () => {
				setData(
					model,
					'<paragraph>x<$text bold="true">a[foo]b</$text>y</paragraph>',
					{
						selectionAttributes: {
							bold: true
						}
					}
				);

				deleteContent( model, doc.selection );

				expect( getData( model ) ).to.equal( '<paragraph>x<$text bold="true">a[]b</$text>y</paragraph>' );
				expect( doc.selection.getAttribute( 'bold' ) ).to.equal( true );
			} );
		} );

		// Note: The algorithm does not care what kind of it's merging as it knows nothing useful about these elements.
		// In most cases it handles all elements like you'd expect to handle block elements in HTML. However,
		// in some scenarios where the tree depth is bigger results may be hard to justify. In fact, such cases
		// should not happen unless we're talking about lists or tables, but these features will need to cover
		// their scenarios themselves. In all generic scenarios elements are never nested.
		//
		// You may also be thinking – but I don't want my elements to be merged. It means that there are some special rules,
		// like – multiple editing hosts (cE=true/false in use) or block limit elements like <td>.
		// Those case should, again, be handled by their specific implementations.
		describe( 'in multi-element scenarios', () => {
			beforeEach( () => {
				model = new Model();
				doc = model.document;
				doc.createRoot();

				const schema = model.schema;

				schema.register( 'paragraph', {
					inheritAllFrom: '$block',
					allowIn: 'pparent',
					allowAttributes: 'align'
				} );
				schema.register( 'heading1', { inheritAllFrom: '$block' } );
				schema.register( 'image', { inheritAllFrom: '$text' } );
				schema.register( 'pchild', { allowIn: 'paragraph' } );
				schema.register( 'pparent', { allowIn: '$root' } );
				schema.extend( '$text', { allowIn: [ 'pchild', 'pparent' ] } );
			} );

			test(
				'do not merge when no need to',
				'<paragraph>x</paragraph><paragraph>[foo]</paragraph><paragraph>y</paragraph>',
				'<paragraph>x</paragraph><paragraph>[]</paragraph><paragraph>y</paragraph>'
			);

			test(
				'merges second element into the first one (same name)',
				'<paragraph>x</paragraph><paragraph>fo[o</paragraph><paragraph>b]ar</paragraph><paragraph>y</paragraph>',
				'<paragraph>x</paragraph><paragraph>fo[]ar</paragraph><paragraph>y</paragraph>'
			);

			test(
				'does not merge second element into the first one (same name, !option.merge)',
				'<paragraph>x</paragraph><paragraph>fo[o</paragraph><paragraph>b]ar</paragraph><paragraph>y</paragraph>',
				'<paragraph>x</paragraph><paragraph>fo[]</paragraph><paragraph>ar</paragraph><paragraph>y</paragraph>',
				{ leaveUnmerged: true }
			);

			test(
				'merges second element into the first one (different name)',
				'<paragraph>x</paragraph><heading1>fo[o</heading1><paragraph>b]ar</paragraph><paragraph>y</paragraph>',
				'<paragraph>x</paragraph><heading1>fo[]ar</heading1><paragraph>y</paragraph>'
			);

			// Note: in all these cases we ignore the direction of merge.
			// If https://github.com/ckeditor/ckeditor5-engine/issues/470 was fixed we could differently treat
			// forward and backward delete.
			it( 'merges second element into the first one (different name, backward selection)', () => {
				setData(
					model,
					'<paragraph>x</paragraph><heading1>fo[o</heading1><paragraph>b]ar</paragraph><paragraph>y</paragraph>',
					{ lastRangeBackward: true }
				);

				deleteContent( model, doc.selection );

				expect( getData( model ) ).to.equal( '<paragraph>x</paragraph><heading1>fo[]ar</heading1><paragraph>y</paragraph>' );
			} );

			test(
				'merges second element into the first one (different attrs)',
				'<paragraph>x</paragraph><paragraph align="l">fo[o</paragraph><paragraph>b]ar</paragraph><paragraph>y</paragraph>',
				'<paragraph>x</paragraph><paragraph align="l">fo[]ar</paragraph><paragraph>y</paragraph>'
			);

			test(
				'merges second element to an empty first element',
				'<paragraph>x</paragraph><heading1>[</heading1><paragraph>fo]o</paragraph><paragraph>y</paragraph>',
				'<paragraph>x</paragraph><heading1>[]o</heading1><paragraph>y</paragraph>'
			);

			test(
				'merges empty element into the first element',
				'<heading1>f[oo</heading1><paragraph>bar]</paragraph><paragraph>x</paragraph>',
				'<heading1>f[]</heading1><paragraph>x</paragraph>'
			);

			test(
				'leaves just one element when all selected',
				'<heading1>[x</heading1><paragraph>foo</paragraph><paragraph>y]bar</paragraph>',
				'<heading1>[]bar</heading1>'
			);

			it( 'uses merge delta even if merged element is empty', () => {
				let mergeSpy;

				setData( model, '<paragraph>ab[cd</paragraph><paragraph>efgh]</paragraph>' );

				model.change( writer => {
					mergeSpy = sinon.spy( writer, 'merge' );
					deleteContent( model, doc.selection );
				} );

				expect( getData( model ) ).to.equal( '<paragraph>ab[]</paragraph>' );

				expect( mergeSpy.called ).to.be.true;
			} );

			it( 'uses merge delta even if merged element is empty #2', () => {
				let mergeSpy;

				setData( model, '<paragraph>ab[</paragraph><paragraph>]</paragraph>' );

				model.change( writer => {
					mergeSpy = sinon.spy( writer, 'merge' );
					deleteContent( model, doc.selection );
				} );

				expect( getData( model ) ).to.equal( '<paragraph>ab[]</paragraph>' );

				expect( mergeSpy.called ).to.be.true;
			} );

			it( 'does not try to move the second block if not needed', () => {
				let mergeSpy, moveSpy;

				setData( model, '<paragraph>ab[cd</paragraph><paragraph>ef]gh</paragraph>' );

				model.change( writer => {
					mergeSpy = sinon.spy( writer, 'merge' );
					moveSpy = sinon.spy( writer, 'move' );
					deleteContent( model, doc.selection );
				} );

				expect( getData( model ) ).to.equal( '<paragraph>ab[]gh</paragraph>' );

				expect( moveSpy.called ).to.be.false;
				expect( mergeSpy.called ).to.be.true;
			} );

			// Note: in all these cases we ignore the direction of merge.
			// If https://github.com/ckeditor/ckeditor5-engine/issues/470 was fixed we could differently treat
			// forward and backward delete.
			describe( 'with nested elements', () => {
				test(
					'merges elements when deep nested',
					'<paragraph>x<pchild>fo[o</pchild></paragraph><paragraph><pchild>b]ar</pchild>y</paragraph>',
					'<paragraph>x<pchild>fo[]ar</pchild>y</paragraph>'
				);

				it( 'merges elements when deep nested (3rd level)', () => {
					const root = doc.getRoot();

					// We need to use the raw API due to https://github.com/ckeditor/ckeditor5-engine/issues/905.
					// <pparent>x<paragraph>x<pchild>fo[o</pchild></paragraph></pparent>
					// <pparent><paragraph><pchild>b]ar</pchild>y</paragraph>y</pparent>

					root.appendChildren(
						new Element( 'pparent', null, [
							'x',
							new Element( 'paragraph', null, [
								'x',
								new Element( 'pchild', null, 'foo' )
							] )
						] )
					);

					root.appendChildren(
						new Element( 'pparent', null, [
							new Element( 'paragraph', null, [
								new Element( 'pchild', null, 'bar' ),
								'y'
							] ),
							'y'
						] )
					);

					const range = new Range(
						new Position( doc.getRoot(), [ 0, 1, 1, 2 ] ), // fo[o
						new Position( doc.getRoot(), [ 1, 0, 0, 1 ] ) // b]ar
					);

					doc.selection.setRanges( [ range ] );

					deleteContent( model, doc.selection );

					expect( getData( model ) )
						.to.equal( '<pparent>x<paragraph>x<pchild>fo[]ar</pchild>y</paragraph>y</pparent>' );
				} );

				test(
					'merges elements when left end deep nested',
					'<paragraph>x<pchild>fo[o</pchild></paragraph><paragraph>b]ary</paragraph><paragraph>x</paragraph>',
					'<paragraph>x<pchild>fo[]ary</pchild></paragraph><paragraph>x</paragraph>'
				);

				test(
					'merges elements when right end deep nested',
					'<paragraph>x</paragraph><paragraph>fo[o</paragraph><paragraph><pchild>b]ar</pchild>x</paragraph>',
					'<paragraph>x</paragraph><paragraph>fo[]ar</paragraph><paragraph>x</paragraph>'
				);

				it( 'merges elements when left end deep nested (3rd level)', () => {
					const root = doc.getRoot();

					// We need to use the raw API due to https://github.com/ckeditor/ckeditor5-engine/issues/905.
					// <pparent>x<paragraph>foo<pchild>ba[r</pchild></paragraph></pparent><paragraph>b]om</paragraph>

					root.appendChildren(
						new Element( 'pparent', null, [
							'x',
							new Element( 'paragraph', null, [
								'foo',
								new Element( 'pchild', null, 'bar' )
							] )
						] )
					);

					root.appendChildren(
						new Element( 'paragraph', null, 'bom' )
					);

					const range = new Range(
						new Position( doc.getRoot(), [ 0, 1, 3, 2 ] ), // ba[r
						new Position( doc.getRoot(), [ 1, 1 ] ) // b]om
					);

					doc.selection.setRanges( [ range ] );

					deleteContent( model, doc.selection );

					expect( getData( model ) )
						.to.equal( '<pparent>x<paragraph>foo<pchild>ba[]om</pchild></paragraph></pparent>' );
				} );

				test(
					'merges elements when right end deep nested (in an empty container)',
					'<paragraph>fo[o</paragraph><paragraph><pchild>bar]</pchild></paragraph>',
					'<paragraph>fo[]</paragraph>'
				);

				test(
					'merges elements when left end deep nested (in an empty container)',
					'<paragraph><pchild>[foo</pchild></paragraph><paragraph>b]ar</paragraph><paragraph>x</paragraph>',
					'<paragraph><pchild>[]ar</pchild></paragraph><paragraph>x</paragraph>'
				);

				it( 'merges elements when left end deep nested (3rd level)', () => {
					const root = doc.getRoot();

					// We need to use the raw API due to https://github.com/ckeditor/ckeditor5-engine/issues/905.
					// <paragraph>fo[o</paragraph><pparent><paragraph><pchild>bar]</pchild></paragraph></pparent>

					root.appendChildren(
						new Element( 'paragraph', null, 'foo' )
					);

					root.appendChildren(
						new Element( 'pparent', null, [
							new Element( 'paragraph', null, [
								new Element( 'pchild', null, 'bar' )
							] )
						] )
					);

					const range = new Range(
						new Position( doc.getRoot(), [ 0, 2 ] ), // f[oo
						new Position( doc.getRoot(), [ 1, 0, 0, 3 ] ) // bar]
					);

					doc.selection.setRanges( [ range ] );

					deleteContent( model, doc.selection );

					expect( getData( model ) )
						.to.equal( '<paragraph>fo[]</paragraph>' );
				} );
			} );

			describe( 'with object elements', () => {
				beforeEach( () => {
					const schema = model.schema;

					schema.register( 'blockWidget', {
						isObject: true
					} );
					schema.register( 'nestedEditable', {
						isLimit: true
					} );

					schema.extend( 'blockWidget', { allowIn: '$root' } );

					schema.extend( 'nestedEditable', { allowIn: 'blockWidget' } );
					schema.extend( '$text', { allowIn: 'nestedEditable' } );
				} );

				test(
					'does not merge an object element (if it is first)',
					'<blockWidget><nestedEditable>fo[o</nestedEditable></blockWidget><paragraph>b]ar</paragraph>',
					'<blockWidget><nestedEditable>fo[]</nestedEditable></blockWidget><paragraph>ar</paragraph>'
				);

				test(
					'does not merge an object element (if it is second)',
					'<paragraph>ba[r</paragraph><blockWidget><nestedEditable>f]oo</nestedEditable></blockWidget>',
					'<paragraph>ba[]</paragraph><blockWidget><nestedEditable>oo</nestedEditable></blockWidget>'
				);
			} );

			describe( 'filtering out', () => {
				beforeEach( () => {
					const schema = model.schema;

					schema.on( 'checkAttribute', ( evt, args ) => {
						const ctx = args[ 0 ];
						const attributeName = args[ 1 ];

						// Allow 'a' and 'b' on paragraph>$text.
						if ( ctx.endsWith( 'paragraph $text' ) && [ 'a', 'b' ].includes( attributeName ) ) {
							evt.stop();
							evt.return = true;
						}

						// Allow 'b' and 'c' in pchild>$text.
						if ( ctx.endsWith( 'pchild $text' ) && [ 'b', 'c' ].includes( attributeName ) ) {
							evt.stop();
							evt.return = true;
						}

						// Disallow 'c' on pchild>pchild>$text.
						if ( ctx.endsWith( 'pchild pchild $text' ) && attributeName == 'c' ) {
							evt.stop();
							evt.return = false;
						}
					}, { priority: 'high' } );

					schema.extend( 'pchild', { allowIn: 'pchild' } );
				} );

				test(
					'filters out disallowed attributes after left merge',
					'<paragraph>x<pchild>fo[o</pchild></paragraph><paragraph>y]<$text a="1" b="1">z</$text></paragraph>',
					'<paragraph>x<pchild>fo[]<$text b="1">z</$text></pchild></paragraph>'
				);

				test(
					'filters out disallowed attributes from nested nodes after left merge',
					'<paragraph>' +
						'x' +
						'<pchild>fo[o</pchild>' +
					'</paragraph>' +
					'<paragraph>' +
						'b]a<$text a="1" b="1">r</$text>' +
						'<pchild>b<$text b="1" c="1">i</$text>z</pchild>' +
						'y' +
					'</paragraph>',

					'<paragraph>' +
						'x' +
						'<pchild>' +
							'fo[]a<$text b="1">r</$text>' +
							'<pchild>b<$text b="1">i</$text>z</pchild>' +
							'y' +
						'</pchild>' +
					'</paragraph>'
				);

				test(
					'filters out disallowed attributes after right merge',
					'<paragraph>fo[o</paragraph><paragraph><pchild>x<$text b="1" c="1">y]z</$text></pchild></paragraph>',
					'<paragraph>fo[]<$text b="1">z</$text></paragraph>'
				);
			} );
		} );

		describe( 'in element selections scenarios', () => {
			beforeEach( () => {
				model = new Model();
				doc = model.document;

				// <p> like root.
				doc.createRoot( 'paragraph', 'paragraphRoot' );
				// <body> like root.
				doc.createRoot( '$root', 'bodyRoot' );
				// Special root which allows only blockWidgets inside itself.
				doc.createRoot( 'restrictedRoot', 'restrictedRoot' );

				const schema = model.schema;

				schema.register( 'image', { allowWhere: '$text' } );
				schema.register( 'paragraph', { inheritAllFrom: '$block' } );
				schema.register( 'heading1', { inheritAllFrom: '$block' } );
				schema.register( 'blockWidget' );
				schema.register( 'restrictedRoot', {
					isLimit: true
				} );

				schema.extend( '$block', { allowIn: '$root' } );
				schema.extend( 'blockWidget', { allowIn: '$root' } );

				schema.extend( 'blockWidget', { allowIn: 'restrictedRoot' } );
			} );

			// See also "in simple scenarios => deletes an element".

			it( 'deletes two inline elements', () => {
				model.schema.extend( 'paragraph', {
					isLimit: true
				} );

				setData(
					model,
					'x[<image></image><image></image>]z',
					{ rootName: 'paragraphRoot' }
				);

				deleteContent( model, doc.selection );

				expect( getData( model, { rootName: 'paragraphRoot' } ) )
					.to.equal( 'x[]z' );
			} );

			it( 'creates a paragraph when text is not allowed (paragraph selected)', () => {
				setData(
					model,
					'<paragraph>x</paragraph>[<paragraph>yyy</paragraph>]<paragraph>z</paragraph>',
					{ rootName: 'bodyRoot' }
				);

				deleteContent( model, doc.selection );

				expect( getData( model, { rootName: 'bodyRoot' } ) )
					.to.equal( '<paragraph>x</paragraph><paragraph>[]</paragraph><paragraph>z</paragraph>' );
			} );

			it( 'creates a paragraph when text is not allowed (block widget selected)', () => {
				setData(
					model,
					'<paragraph>x</paragraph>[<blockWidget></blockWidget>]<paragraph>z</paragraph>',
					{ rootName: 'bodyRoot' }
				);

				deleteContent( model, doc.selection );

				expect( getData( model, { rootName: 'bodyRoot' } ) )
					.to.equal( '<paragraph>x</paragraph><paragraph>[]</paragraph><paragraph>z</paragraph>' );
			} );

			it( 'creates paragraph when text is not allowed (heading selected)', () => {
				setData(
					model,
					'<paragraph>x</paragraph>[<heading1>yyy</heading1>]<paragraph>z</paragraph>',
					{ rootName: 'bodyRoot' }
				);

				deleteContent( model, doc.selection );

				expect( getData( model, { rootName: 'bodyRoot' } ) )
					.to.equal( '<paragraph>x</paragraph><paragraph>[]</paragraph><paragraph>z</paragraph>' );
			} );

			it( 'creates paragraph when text is not allowed (two blocks selected)', () => {
				setData(
					model,
					'<paragraph>x</paragraph>[<heading1>yyy</heading1><paragraph>yyy</paragraph>]<paragraph>z</paragraph>',
					{ rootName: 'bodyRoot' }
				);

				deleteContent( model, doc.selection );

				expect( getData( model, { rootName: 'bodyRoot' } ) )
					.to.equal( '<paragraph>x</paragraph><paragraph>[]</paragraph><paragraph>z</paragraph>' );
			} );

			it( 'creates paragraph when text is not allowed (all content selected)', () => {
				setData(
					model,
					'[<heading1>x</heading1><paragraph>z</paragraph>]',
					{ rootName: 'bodyRoot' }
				);

				deleteContent( model, doc.selection );

				expect( getData( model, { rootName: 'bodyRoot' } ) )
					.to.equal( '<paragraph>[]</paragraph>' );
			} );

			it( 'does not create a paragraph when it is not allowed', () => {
				setData(
					model,
					'<blockWidget></blockWidget>[<blockWidget></blockWidget>]<blockWidget></blockWidget>',
					{ rootName: 'restrictedRoot' }
				);

				deleteContent( model, doc.selection );

				expect( getData( model, { rootName: 'restrictedRoot' } ) )
					.to.equal( '<blockWidget></blockWidget>[]<blockWidget></blockWidget>' );
			} );
		} );

		describe( 'integration with inline limit elements', () => {
			beforeEach( () => {
				model = new Model();
				doc = model.document;
				doc.createRoot();

				const schema = model.schema;

				schema.register( 'inlineLimit', {
					isLimit: true,
					allowIn: '$root'
				} );
				schema.extend( '$text', {
					allowIn: [ 'inlineLimit', '$root', 'x' ]
				} );
				schema.register( 'x', { allowIn: '$root' } );
			} );

			test(
				'should delete inside inline limit element',
				'<inlineLimit>foo [bar] baz</inlineLimit>',
				'<inlineLimit>foo [] baz</inlineLimit>'
			);

			test(
				'should delete whole inline limit element',
				'x[<inlineLimit>foo bar</inlineLimit>]x',
				'x[]x'
			);

			test(
				'should delete from two inline limit elements',
				'<inlineLimit>foo [bar</inlineLimit><inlineLimit>baz] qux</inlineLimit>',
				'<inlineLimit>foo []</inlineLimit><inlineLimit> qux</inlineLimit>'
			);

			test(
				'merge option should be ignored if both elements are limits',
				'<inlineLimit>foo [bar</inlineLimit><inlineLimit>baz] qux</inlineLimit>',
				'<inlineLimit>foo []</inlineLimit><inlineLimit> qux</inlineLimit>'
			);

			test(
				'merge option should be ignored if the first element is a limit',
				'<inlineLimit>foo [bar</inlineLimit><x>baz] qux</x>',
				'<inlineLimit>foo []</inlineLimit><x> qux</x>'
			);

			test(
				'merge option should be ignored if the second element is a limit',
				'<x>baz [qux</x><inlineLimit>foo] bar</inlineLimit>',
				'<x>baz []</x><inlineLimit> bar</inlineLimit>'
			);
		} );

		describe( 'integration with block limit elements', () => {
			beforeEach( () => {
				model = new Model();
				doc = model.document;
				doc.createRoot();

				const schema = model.schema;

				schema.register( 'blockLimit', {
					isLimit: true
				} );
				schema.extend( 'blockLimit', { allowIn: '$root' } );
				schema.extend( '$block', { allowIn: 'blockLimit' } );

				schema.register( 'paragraph', { inheritAllFrom: '$block' } );
			} );

			test(
				'should delete inside block limit element',
				'<blockLimit><paragraph>fo[o</paragraph><paragraph>b]ar</paragraph></blockLimit>',
				'<blockLimit><paragraph>fo[]</paragraph><paragraph>ar</paragraph></blockLimit>',
				{ leaveUnmerged: true }
			);

			test(
				'should delete inside block limit element (with merge)',
				'<blockLimit><paragraph>fo[o</paragraph><paragraph>b]ar</paragraph></blockLimit>',
				'<blockLimit><paragraph>fo[]ar</paragraph></blockLimit>'
			);

			test(
				'should delete whole block limit element',
				'<paragraph>x</paragraph>[<blockLimit><paragraph>foo</paragraph></blockLimit>]<paragraph>x</paragraph>',
				'<paragraph>x</paragraph><paragraph>[]</paragraph><paragraph>x</paragraph>'
			);

			test(
				'should delete from two block limit elements',
				'<blockLimit><paragraph>foo [bar</paragraph></blockLimit><blockLimit><paragraph>baz] qux</paragraph></blockLimit>',
				'<blockLimit><paragraph>foo []</paragraph></blockLimit><blockLimit><paragraph> qux</paragraph></blockLimit>'
			);

			test(
				'merge option should be ignored if any of the elements is a limit',
				'<blockLimit><paragraph>foo [bar</paragraph></blockLimit><blockLimit><paragraph>baz] qux</paragraph></blockLimit>',
				'<blockLimit><paragraph>foo []</paragraph></blockLimit><blockLimit><paragraph> qux</paragraph></blockLimit>'
			);
		} );

		describe( 'should leave a paragraph if the entire content was selected', () => {
			beforeEach( () => {
				model = new Model();
				doc = model.document;
				doc.createRoot();

				const schema = model.schema;

				schema.register( 'div', {
					inheritAllFrom: '$block',
					isLimit: true
				} );

				schema.register( 'article', {
					inheritAllFrom: '$block',
					isLimit: true
				} );

				schema.register( 'image', {
					allowWhere: '$text',
					isObject: true
				} );

				schema.register( 'paragraph', { inheritAllFrom: '$block' } );
				schema.register( 'heading1', { inheritAllFrom: '$block' } );
				schema.register( 'heading2', { inheritAllFrom: '$block' } );

				schema.extend( '$text', { allowIn: '$root' } );

				schema.extend( 'image', { allowIn: '$root' } );
				schema.extend( 'image', { allowIn: 'heading1' } );
				schema.extend( 'heading1', { allowIn: 'div' } );
				schema.extend( 'paragraph', { allowIn: 'div' } );
				schema.extend( 'heading1', { allowIn: 'article' } );
				schema.extend( 'heading2', { allowIn: 'article' } );
			} );

			test(
				'but not if only one block was selected',
				'<heading1>[xx]</heading1>',
				'<heading1>[]</heading1>'
			);

			test(
				'when the entire heading and paragraph were selected',
				'<heading1>[xx</heading1><paragraph>yy]</paragraph>',
				'<paragraph>[]</paragraph>'
			);

			test(
				'when the entire content was selected',
				'<heading1>[x</heading1><paragraph>foo</paragraph><paragraph>y]</paragraph>',
				'<paragraph>[]</paragraph>'
			);

			test(
				'inside the limit element when the entire heading and paragraph were inside',
				'<div><heading1>[xx</heading1><paragraph>yy]</paragraph></div>',
				'<div><paragraph>[]</paragraph></div>'
			);

			test(
				'but not if schema does not accept paragraph in limit element',
				'<article><heading1>[xx</heading1><heading2>yy]</heading2></article>',
				'<article><heading1>[]</heading1></article>'
			);

			test(
				'but not if selection is not containing the whole content',
				'<image></image><heading1>[xx</heading1><paragraph>yy]</paragraph>',
				'<image></image><heading1>[]</heading1>'
			);

			test(
				'but not if only single element is selected',
				'<heading1>[<image></image>xx]</heading1>',
				'<heading1>[]</heading1>'
			);

			it( 'when root element was not added as Schema limits work fine as well', () => {
				doc.createRoot( 'paragraph', 'paragraphRoot' );

				setData(
					model,
					'x[<image></image><image></image>]z',
					{ rootName: 'paragraphRoot' }
				);

				deleteContent( model, doc.selection );

				expect( getData( model, { rootName: 'paragraphRoot' } ) )
					.to.equal( 'x[]z' );
			} );

			test(
				'but not if the flag "doNotResetEntireContent" is set to true',
				'<heading1>[</heading1><paragraph>]</paragraph>',
				'<heading1>[]</heading1>',
				{
					doNotResetEntireContent: true
				}
			);
		} );

		function test( title, input, output, options ) {
			it( title, () => {
				setData( model, input );

				deleteContent( model, doc.selection, options );

				expect( getData( model ) ).to.equal( output );
			} );
		}
	} );
} );
