import { TempNode } from '../TempNode.js'
import { UVNode } from '../accessors/UVNode.js'
import { Vector2Node } from '../inputs/Vector2Node.js'
import { FloatNode } from '../inputs/FloatNode.js'
import { FunctionNode } from '../FunctionNode.js'



var BlurNode = function ( value, coord, radius, size ) {

	TempNode.call( this, 'v4' );

	this.value = value;
	this.coord = coord || new UVNode();
	this.radius = new Vector2Node( 1, 1 );
	this.size = size;

	this.blurX = true;
	this.blurY = true;

	this.horizontal = new FloatNode( 1 / 64 );
	this.vertical = new FloatNode( 1 / 64 );

};

BlurNode.fBlurX = new FunctionNode( [
	"vec4 blurX( sampler2D texture, vec2 uv, float s ) {",
	"	vec4 sum = vec4( 0.0 );",
	"	sum += texture2D( texture, vec2( uv.x - 4.0 * s, uv.y ) ) * 0.051;",
	"	sum += texture2D( texture, vec2( uv.x - 3.0 * s, uv.y ) ) * 0.0918;",
	"	sum += texture2D( texture, vec2( uv.x - 2.0 * s, uv.y ) ) * 0.12245;",
	"	sum += texture2D( texture, vec2( uv.x - 1.0 * s, uv.y ) ) * 0.1531;",
	"	sum += texture2D( texture, vec2( uv.x, uv.y ) ) * 0.1633;",
	"	sum += texture2D( texture, vec2( uv.x + 1.0 * s, uv.y ) ) * 0.1531;",
	"	sum += texture2D( texture, vec2( uv.x + 2.0 * s, uv.y ) ) * 0.12245;",
	"	sum += texture2D( texture, vec2( uv.x + 3.0 * s, uv.y ) ) * 0.0918;",
	"	sum += texture2D( texture, vec2( uv.x + 4.0 * s, uv.y ) ) * 0.051;",
	"	return sum;",
	"}"
].join( "\n" ) );

BlurNode.fBlurY = new FunctionNode( [
	"vec4 blurY( sampler2D texture, vec2 uv, float s ) {",
	"	vec4 sum = vec4( 0.0 );",
	"	sum += texture2D( texture, vec2( uv.x, uv.y - 4.0 * s ) ) * 0.051;",
	"	sum += texture2D( texture, vec2( uv.x, uv.y - 3.0 * s ) ) * 0.0918;",
	"	sum += texture2D( texture, vec2( uv.x, uv.y - 2.0 * s ) ) * 0.12245;",
	"	sum += texture2D( texture, vec2( uv.x, uv.y - 1.0 * s ) ) * 0.1531;",
	"	sum += texture2D( texture, vec2( uv.x, uv.y ) ) * 0.1633;",
	"	sum += texture2D( texture, vec2( uv.x, uv.y + 1.0 * s ) ) * 0.1531;",
	"	sum += texture2D( texture, vec2( uv.x, uv.y + 2.0 * s ) ) * 0.12245;",
	"	sum += texture2D( texture, vec2( uv.x, uv.y + 3.0 * s ) ) * 0.0918;",
	"	sum += texture2D( texture, vec2( uv.x, uv.y + 4.0 * s ) ) * 0.051;",
	"	return sum;",
	"}"
].join( "\n" ) );

BlurNode.prototype = Object.create( TempNode.prototype );
BlurNode.prototype.constructor = BlurNode;
BlurNode.prototype.nodeType = "Blur";

BlurNode.prototype.updateFrame = function ( frame ) {

	if ( this.size ) {

		this.horizontal.value = this.radius.x / this.size.x;
		this.vertical.value = this.radius.y / this.size.y;

	} else if ( this.value.value && this.value.value.image ) {

		var image = this.value.value.image;

		this.horizontal.value = this.radius.x / image.width;
		this.vertical.value = this.radius.y / image.height;

	}

};

BlurNode.prototype.generate = function ( builder, output ) {

	var material = builder.material, blurX = BlurNode.fBlurX, blurY = BlurNode.fBlurY;

	builder.include( blurX );
	builder.include( blurY );

	if ( builder.isShader( 'fragment' ) ) {

		var blurCode = [], code;

		if ( this.blurX ) {

			blurCode.push( blurX.name + '(' + this.value.build( builder, 'sampler2D' ) + ',' + this.coord.build( builder, 'v2' ) + ',' + this.horizontal.build( builder, 'fv1' ) + ')' );

		}

		if ( this.blurY ) {

			blurCode.push( blurY.name + '(' + this.value.build( builder, 'sampler2D' ) + ',' + this.coord.build( builder, 'v2' ) + ',' + this.vertical.build( builder, 'fv1' ) + ')' );

		}

		if ( blurCode.length == 2 ) code = '(' + blurCode.join( '+' ) + '/2.0)';
		else if ( blurCode.length ) code = '(' + blurCode[ 0 ] + ')';
		else code = 'vec4( 0.0 )';

		return builder.format( code, this.getType( builder ), output );

	} else {

		console.warn( "BlurNode is not compatible with " + builder.shader + " shader." );

		return builder.format( 'vec4( 0.0 )', this.getType( builder ), output );

	}

};

BlurNode.prototype.toJSON = function ( meta ) {

	var data = this.getJSONNode( meta );

	if ( ! data ) {

		data = this.createJSONNode( meta );

		data.value = this.value.toJSON( meta ).uuid;
		data.coord = this.coord.toJSON( meta ).uuid;
		data.radius = this.radius.toJSON( meta ).uuid;

		if ( this.size ) data.size = { x: this.size.x, y: this.size.y };

		data.blurX = this.blurX;
		data.blurY = this.blurY;

	}

	return data;

};

export { BlurNode }
