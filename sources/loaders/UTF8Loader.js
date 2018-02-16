import { BufferGeometry } from '../core/BufferGeometry.js'
import { BufferAttribute } from '../core/BufferAttribute.js'
import { Object3D } from '../core/Object3D.js'
import { MTLLoader } from './MTLLoader.js'
import { Mesh } from '../objects/Mesh.js'
import { FileLoader } from './FileLoader.js'



var UTF8Loader = function () {};



UTF8Loader.prototype.load = function ( jsonUrl, callback, options ) {

	this.downloadModelJson( jsonUrl, callback, options );

};

// BufferGeometryCreator

UTF8Loader.BufferGeometryCreator = function () {
};

UTF8Loader.BufferGeometryCreator.prototype.create = function ( attribArray, indices ) {

	var ntris = indices.length / 3;

	var geometry = new BufferGeometry();

	var positions = new Float32Array( ntris * 3 * 3 );
	var normals = new Float32Array( ntris * 3 * 3 );
	var uvs = new Float32Array( ntris * 3 * 2 );

	var i, j, offset;

	var end = attribArray.length;
	var stride = 8;

	// extract positions

	j = 0;
	offset = 0;

	for ( i = offset; i < end; i += stride ) {

		positions[ j ++ ] = attribArray[ i ];
		positions[ j ++ ] = attribArray[ i + 1 ];
		positions[ j ++ ] = attribArray[ i + 2 ];

	}

	// extract uvs

	j = 0;
	offset = 3;

	for ( i = offset; i < end; i += stride ) {

		uvs[ j ++ ] = attribArray[ i ];
		uvs[ j ++ ] = attribArray[ i + 1 ];

	}

	// extract normals

	j = 0;
	offset = 5;

	for ( i = offset; i < end; i += stride ) {

		normals[ j ++ ] = attribArray[ i ];
		normals[ j ++ ] = attribArray[ i + 1 ];
		normals[ j ++ ] = attribArray[ i + 2 ];

	}

	geometry.setIndex( new BufferAttribute( indices, 1 ) );
	geometry.addAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.addAttribute( 'normal', new BufferAttribute( normals, 3 ) );
	geometry.addAttribute( 'uv', new BufferAttribute( uvs, 2 ) );

	geometry.computeBoundingSphere();

	return geometry;

};


// UTF-8 decoder from webgl-loader (r100)
// http://code.google.com/p/webgl-loader/

// Model manifest description. Contains objects like:
// name: {
//   materials: { 'material_name': { ... } ... },
//   decodeParams: {
//     decodeOffsets: [ ... ],
//     decodeScales: [ ... ],
//   },
//   urls: {
//     'url': [
//       { material: 'material_name',
//         attribRange: [#, #],
//         indexRange: [#, #],
//         names: [ 'object names' ... ],
//         lengths: [#, #, # ... ]
//       }
//     ],
//     ...
//   }
// }

var DEFAULT_DECODE_PARAMS = {

	decodeOffsets: [ - 4095, - 4095, - 4095, 0, 0, - 511, - 511, - 511 ],
	decodeScales: [ 1 / 8191, 1 / 8191, 1 / 8191, 1 / 1023, 1 / 1023, 1 / 1023, 1 / 1023, 1 / 1023 ]

	// TODO: normal decoding? (see walt.js)
	// needs to know: input, output (from vertex format!)
	//
	// Should split attrib/index.
	// 1) Decode position and non-normal attributes.
	// 2) Decode indices, computing normals
	// 3) Maybe normalize normals? Only necessary for refinement, or fixed?
	// 4) Maybe refine normals? Should this be part of regular refinement?
	// 5) Morphing

};

// Triangle strips!

// TODO: will it be an optimization to specialize this method at
// runtime for different combinations of stride, decodeOffset and
// decodeScale?

UTF8Loader.prototype.decompressAttribsInner_ = function ( str, inputStart, inputEnd,
	output, outputStart, stride, decodeOffset, decodeScale ) {

	var prev = 0;

	for ( var j = inputStart; j < inputEnd; j ++ ) {

		var code = str.charCodeAt( j );
		prev += ( code >> 1 ) ^ ( - ( code & 1 ) );

		output[ outputStart ] = decodeScale * ( prev + decodeOffset );
		outputStart += stride;

	}

};

UTF8Loader.prototype.decompressIndices_ = function ( str, inputStart, numIndices, output, outputStart ) {

	var highest = 0;

	for ( var i = 0; i < numIndices; i ++ ) {

		var code = str.charCodeAt( inputStart ++ );

		output[ outputStart ++ ] = highest - code;

		if ( code === 0 ) {

			highest ++;

		}

	}

};

UTF8Loader.prototype.decompressAABBs_ = function ( str, inputStart, numBBoxen, decodeOffsets, decodeScales ) {

	var numFloats = 6 * numBBoxen;

	var inputEnd = inputStart + numFloats;
	var outputStart = 0;

	var bboxen = new Float32Array( numFloats );

	for ( var i = inputStart; i < inputEnd; i += 6 ) {

		var minX = str.charCodeAt( i + 0 ) + decodeOffsets[ 0 ];
		var minY = str.charCodeAt( i + 1 ) + decodeOffsets[ 1 ];
		var minZ = str.charCodeAt( i + 2 ) + decodeOffsets[ 2 ];

		var radiusX = ( str.charCodeAt( i + 3 ) + 1 ) >> 1;
		var radiusY = ( str.charCodeAt( i + 4 ) + 1 ) >> 1;
		var radiusZ = ( str.charCodeAt( i + 5 ) + 1 ) >> 1;

		bboxen[ outputStart ++ ] = decodeScales[ 0 ] * ( minX + radiusX );
		bboxen[ outputStart ++ ] = decodeScales[ 1 ] * ( minY + radiusY );
		bboxen[ outputStart ++ ] = decodeScales[ 2 ] * ( minZ + radiusZ );

		bboxen[ outputStart ++ ] = decodeScales[ 0 ] * radiusX;
		bboxen[ outputStart ++ ] = decodeScales[ 1 ] * radiusY;
		bboxen[ outputStart ++ ] = decodeScales[ 2 ] * radiusZ;

	}

	return bboxen;

};

UTF8Loader.prototype.decompressMesh = function ( str, meshParams, decodeParams, name, idx, callback ) {

	// Extract conversion parameters from attribArrays.

	var stride = decodeParams.decodeScales.length;

	var decodeOffsets = decodeParams.decodeOffsets;
	var decodeScales = decodeParams.decodeScales;

	var attribStart = meshParams.attribRange[ 0 ];
	var numVerts = meshParams.attribRange[ 1 ];

	// Decode attributes.

	var inputOffset = attribStart;
	var attribsOut = new Float32Array( stride * numVerts );

	for ( var j = 0; j < stride; j ++ ) {

		var end = inputOffset + numVerts;

		var decodeScale = decodeScales[ j ];

		if ( decodeScale ) {

			// Assume if decodeScale is never set, simply ignore the
			// attribute.

			this.decompressAttribsInner_( str, inputOffset, end, attribsOut, j, stride, decodeOffsets[ j ], decodeScale );

		}

		inputOffset = end;

	}

	var numIndices = 3 * meshParams.indexRange[ 1 ];

	var indicesOut = new Uint16Array( numIndices );

	this.decompressIndices_( str, inputOffset, numIndices, indicesOut, 0 );

	// Decode bboxen.

	var bboxen = undefined;
	var bboxOffset = meshParams.bboxes;

	if ( bboxOffset ) {

		bboxen = this.decompressAABBs_( str, bboxOffset, meshParams.names.length, decodeOffsets, decodeScales );

	}

	callback( name, idx, attribsOut, indicesOut, bboxen, meshParams );

};

UTF8Loader.prototype.copyAttrib = function ( stride, attribsOutFixed, lastAttrib, index ) {

	for ( var j = 0; j < stride; j ++ ) {

		lastAttrib[ j ] = attribsOutFixed[ stride * index + j ];

	}

};

UTF8Loader.prototype.decodeAttrib2 = function ( str, stride, decodeOffsets, decodeScales, deltaStart,
	numVerts, attribsOut, attribsOutFixed, lastAttrib, index ) {

	for ( var j = 0; j < 5; j ++ ) {

		var code = str.charCodeAt( deltaStart + numVerts * j + index );
		var delta = ( code >> 1 ) ^ ( - ( code & 1 ) );

		lastAttrib[ j ] += delta;
		attribsOutFixed[ stride * index + j ] = lastAttrib[ j ];
		attribsOut[ stride * index + j ] = decodeScales[ j ] * ( lastAttrib[ j ] + decodeOffsets[ j ] );

	}

};

UTF8Loader.prototype.accumulateNormal = function ( i0, i1, i2, attribsOutFixed, crosses ) {

	var p0x = attribsOutFixed[ 8 * i0 ];
	var p0y = attribsOutFixed[ 8 * i0 + 1 ];
	var p0z = attribsOutFixed[ 8 * i0 + 2 ];

	var p1x = attribsOutFixed[ 8 * i1 ];
	var p1y = attribsOutFixed[ 8 * i1 + 1 ];
	var p1z = attribsOutFixed[ 8 * i1 + 2 ];

	var p2x = attribsOutFixed[ 8 * i2 ];
	var p2y = attribsOutFixed[ 8 * i2 + 1 ];
	var p2z = attribsOutFixed[ 8 * i2 + 2 ];

	p1x -= p0x;
	p1y -= p0y;
	p1z -= p0z;

	p2x -= p0x;
	p2y -= p0y;
	p2z -= p0z;

	p0x = p1y * p2z - p1z * p2y;
	p0y = p1z * p2x - p1x * p2z;
	p0z = p1x * p2y - p1y * p2x;

	crosses[ 3 * i0 ] += p0x;
	crosses[ 3 * i0 + 1 ] += p0y;
	crosses[ 3 * i0 + 2 ] += p0z;

	crosses[ 3 * i1 ] += p0x;
	crosses[ 3 * i1 + 1 ] += p0y;
	crosses[ 3 * i1 + 2 ] += p0z;

	crosses[ 3 * i2 ] += p0x;
	crosses[ 3 * i2 + 1 ] += p0y;
	crosses[ 3 * i2 + 2 ] += p0z;

};

UTF8Loader.prototype.decompressMesh2 = function ( str, meshParams, decodeParams, name, idx, callback ) {

	var MAX_BACKREF = 96;

	// Extract conversion parameters from attribArrays.

	var stride = decodeParams.decodeScales.length;

	var decodeOffsets = decodeParams.decodeOffsets;
	var decodeScales = decodeParams.decodeScales;

	var deltaStart = meshParams.attribRange[ 0 ];
	var numVerts = meshParams.attribRange[ 1 ];

	var codeStart = meshParams.codeRange[ 0 ];

	var numIndices = 3 * meshParams.codeRange[ 2 ];

	var indicesOut = new Uint16Array( numIndices );

	var crosses = new Int32Array( 3 * numVerts );

	var lastAttrib = new Uint16Array( stride );

	var attribsOutFixed = new Uint16Array( stride * numVerts );
	var attribsOut = new Float32Array( stride * numVerts );

	var highest = 0;
	var outputStart = 0;

	for ( var i = 0; i < numIndices; i += 3 ) {

		var code = str.charCodeAt( codeStart ++ );

		var max_backref = Math.min( i, MAX_BACKREF );

		if ( code < max_backref ) {

  		// Parallelogram

			var winding = code % 3;
			var backref = i - ( code - winding );
			var i0, i1, i2;

			switch ( winding ) {

				case 0:

					i0 = indicesOut[ backref + 2 ];
					i1 = indicesOut[ backref + 1 ];
					i2 = indicesOut[ backref + 0 ];
					break;

				case 1:

					i0 = indicesOut[ backref + 0 ];
					i1 = indicesOut[ backref + 2 ];
					i2 = indicesOut[ backref + 1 ];
					break;

				case 2:

					i0 = indicesOut[ backref + 1 ];
					i1 = indicesOut[ backref + 0 ];
					i2 = indicesOut[ backref + 2 ];
					break;

			}

			indicesOut[ outputStart ++ ] = i0;
			indicesOut[ outputStart ++ ] = i1;

			code = str.charCodeAt( codeStart ++ );

			var index = highest - code;
			indicesOut[ outputStart ++ ] = index;

			if ( code === 0 ) {

				for ( var j = 0; j < 5; j ++ ) {

					var deltaCode = str.charCodeAt( deltaStart + numVerts * j + highest );

					var prediction = ( ( deltaCode >> 1 ) ^ ( - ( deltaCode & 1 ) ) ) +
						attribsOutFixed[ stride * i0 + j ] +
						attribsOutFixed[ stride * i1 + j ] -
						attribsOutFixed[ stride * i2 + j ];

					lastAttrib[ j ] = prediction;

					attribsOutFixed[ stride * highest + j ] = prediction;
					attribsOut[ stride * highest + j ] = decodeScales[ j ] * ( prediction + decodeOffsets[ j ] );

				}

				highest ++;

			} else {

				this.copyAttrib( stride, attribsOutFixed, lastAttrib, index );

			}

			this.accumulateNormal( i0, i1, index, attribsOutFixed, crosses );

		} else {

			// Simple

			var index0 = highest - ( code - max_backref );

			indicesOut[ outputStart ++ ] = index0;

			if ( code === max_backref ) {

				this.decodeAttrib2( str, stride, decodeOffsets, decodeScales, deltaStart,
					numVerts, attribsOut, attribsOutFixed, lastAttrib, highest ++ );

			} else {

				this.copyAttrib( stride, attribsOutFixed, lastAttrib, index0 );

			}

			code = str.charCodeAt( codeStart ++ );

			var index1 = highest - code;
			indicesOut[ outputStart ++ ] = index1;

			if ( code === 0 ) {

				this.decodeAttrib2( str, stride, decodeOffsets, decodeScales, deltaStart,
					numVerts, attribsOut, attribsOutFixed, lastAttrib, highest ++ );

			} else {

				this.copyAttrib( stride, attribsOutFixed, lastAttrib, index1 );

			}

			code = str.charCodeAt( codeStart ++ );

			var index2 = highest - code;
			indicesOut[ outputStart ++ ] = index2;

			if ( code === 0 ) {

				for ( var j = 0; j < 5; j ++ ) {

					lastAttrib[ j ] = ( attribsOutFixed[ stride * index0 + j ] + attribsOutFixed[ stride * index1 + j ] ) / 2;

				}

				this.decodeAttrib2( str, stride, decodeOffsets, decodeScales, deltaStart,
					numVerts, attribsOut, attribsOutFixed, lastAttrib, highest ++ );

			} else {

				this.copyAttrib( stride, attribsOutFixed, lastAttrib, index2 );

			}

			this.accumulateNormal( index0, index1, index2, attribsOutFixed, crosses );

		}

	}

	for ( var i = 0; i < numVerts; i ++ ) {

		var nx = crosses[ 3 * i ];
		var ny = crosses[ 3 * i + 1 ];
		var nz = crosses[ 3 * i + 2 ];

		var norm = 511.0 / Math.sqrt( nx * nx + ny * ny + nz * nz );

		var cx = str.charCodeAt( deltaStart + 5 * numVerts + i );
		var cy = str.charCodeAt( deltaStart + 6 * numVerts + i );
		var cz = str.charCodeAt( deltaStart + 7 * numVerts + i );

		attribsOut[ stride * i + 5 ] = norm * nx + ( ( cx >> 1 ) ^ ( - ( cx & 1 ) ) );
		attribsOut[ stride * i + 6 ] = norm * ny + ( ( cy >> 1 ) ^ ( - ( cy & 1 ) ) );
		attribsOut[ stride * i + 7 ] = norm * nz + ( ( cz >> 1 ) ^ ( - ( cz & 1 ) ) );

	}

	callback( name, idx, attribsOut, indicesOut, undefined, meshParams );

};

UTF8Loader.prototype.downloadMesh = function ( path, name, meshEntry, decodeParams, callback ) {

	var loader = this;
	var idx = 0;

	function onprogress( data ) {

		while ( idx < meshEntry.length ) {

			var meshParams = meshEntry[ idx ];
			var indexRange = meshParams.indexRange;

			if ( indexRange ) {

				var meshEnd = indexRange[ 0 ] + 3 * indexRange[ 1 ];

				if ( data.length < meshEnd ) break;

				loader.decompressMesh( data, meshParams, decodeParams, name, idx, callback );

			} else {

				var codeRange = meshParams.codeRange;
				var meshEnd = codeRange[ 0 ] + codeRange[ 1 ];

				if ( data.length < meshEnd ) break;

				loader.decompressMesh2( data, meshParams, decodeParams, name, idx, callback );

			}

			++ idx;

		}

	}

	getHttpRequest( path, function ( data ) {

		onprogress( data );

		// TODO: handle errors.

	} );

};

UTF8Loader.prototype.downloadMeshes = function ( path, meshUrlMap, decodeParams, callback ) {

	for ( var url in meshUrlMap ) {

		var meshEntry = meshUrlMap[ url ];
		this.downloadMesh( path + url, url, meshEntry, decodeParams, callback );

	}

};

UTF8Loader.prototype.createMeshCallback = function ( materialBaseUrl, loadModelInfo, allDoneCallback ) {

	var nCompletedUrls = 0;
	var nExpectedUrls = 0;

	var expectedMeshesPerUrl = {};
	var decodedMeshesPerUrl = {};

	var modelParts = {};

	var meshUrlMap = loadModelInfo.urls;

	for ( var url in meshUrlMap ) {

		expectedMeshesPerUrl[ url ] = meshUrlMap[ url ].length;
		decodedMeshesPerUrl[ url ] = 0;

		nExpectedUrls ++;

		modelParts[ url ] = new Object3D();

	}

	var model = new Object3D();

	// Prepare materials first...

	var materialCreator = new MTLLoader.MaterialCreator( materialBaseUrl, loadModelInfo.options );
	materialCreator.setMaterials( loadModelInfo.materials );

	materialCreator.preload();

	// Create callback for creating mesh parts

	var bufferGeometryCreator = new UTF8Loader.BufferGeometryCreator();

	var meshCallback = function ( name, idx, attribArray, indexArray, bboxen, meshParams ) {

		// Got ourselves a new mesh

		// name identifies this part of the model (url)
		// idx is the mesh index of this mesh of the part
		// attribArray defines the vertices
		// indexArray defines the faces
		// bboxen defines the bounding box
		// meshParams contains the material info

		var geometry = bufferGeometryCreator.create( attribArray, indexArray );
		var material = materialCreator.create( meshParams.material );

		var mesh = new Mesh( geometry, material );
		modelParts[ name ].add( mesh );

		//model.add(new Mesh(geometry, material));

		decodedMeshesPerUrl[ name ] ++;

		if ( decodedMeshesPerUrl[ name ] === expectedMeshesPerUrl[ name ] ) {

			nCompletedUrls ++;

			model.add( modelParts[ name ] );

			if ( nCompletedUrls === nExpectedUrls ) {

				// ALL DONE!!!

				allDoneCallback( model );

			}

		}

	};

	return meshCallback;

};

UTF8Loader.prototype.downloadModel = function ( geometryBase, materialBase, model, callback ) {

	var meshCallback = this.createMeshCallback( materialBase, model, callback );
	this.downloadMeshes( geometryBase, model.urls, model.decodeParams, meshCallback );

};

UTF8Loader.prototype.downloadModelJson = function ( jsonUrl, callback, options ) {

	getJsonRequest( jsonUrl, function ( loaded ) {

		if ( ! loaded.decodeParams ) {

			if ( options && options.decodeParams ) {

				loaded.decodeParams = options.decodeParams;

			} else {

				loaded.decodeParams = DEFAULT_DECODE_PARAMS;

			}

		}

		loaded.options = options;

		var geometryBase = jsonUrl.substr( 0, jsonUrl.lastIndexOf( "/" ) + 1 );
		var materialBase = geometryBase;

		if ( options && options.geometryBase ) {

			geometryBase = options.geometryBase;

			if ( geometryBase.charAt( geometryBase.length - 1 ) !== "/" ) {

				geometryBase = geometryBase + "/";

			}

		}

		if ( options && options.materialBase ) {

			materialBase = options.materialBase;

			if ( materialBase.charAt( materialBase.length - 1 ) !== "/" ) {

				materialBase = materialBase + "/";

			}

		}

		this.downloadModel( geometryBase, materialBase, loaded, callback );

	}.bind( this ) );

};

// XMLHttpRequest stuff

function getHttpRequest( url, onload, opt_onprogress ) {

	var req = new FileLoader();
	req.load( url, onload, opt_onprogress );

}

function getJsonRequest( url, onjson ) {

	getHttpRequest( url, function ( e ) {

		onjson( JSON.parse( e ) );

	},
	function () {} );

}

function addListeners( dom, listeners ) {

	// TODO: handle event capture, object binding.

	for ( var key in listeners ) {

		dom.addEventListener( key, listeners[ key ] );

	}

}

export { UTF8Loader }
