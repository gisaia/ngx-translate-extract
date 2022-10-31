import { tsquery } from '@phenomnomnominal/tsquery';
import {
	Node,
	NamedImports,
	Identifier,
	ClassDeclaration,
	ConstructorDeclaration,
	CallExpression,
	Expression,
	PropertyAccessExpression,
	EnumDeclaration,
	StringLiteral,
	SourceFile,
	TypeReferenceNode,
	EnumMember
} from 'typescript';

import pkg from 'typescript';
const { isIdentifier, isPropertyAccessExpression, isMemberName } = pkg;
import glob from 'glob';
import fs from 'fs';

const { SyntaxKind, isStringLiteralLike, isArrayLiteralExpression, isBinaryExpression, isConditionalExpression } = pkg;

export function getNamedImports(node: Node, moduleName: string): NamedImports[] {
	const query = `ImportDeclaration[moduleSpecifier.text="${moduleName}"] NamedImports`;
	return tsquery<NamedImports>(node, query);
}

export function getNamedImportAlias(node: Node, moduleName: string, importName: string): string | null {
	const [namedImportNode] = getNamedImports(node, moduleName);
	if (!namedImportNode) {
		return null;
	}

	const query = `ImportSpecifier:has(Identifier[name="${importName}"]) > Identifier`;
	const identifiers = tsquery<Identifier>(namedImportNode, query);
	if (identifiers.length === 1) {
		return identifiers[0].text;
	}
	if (identifiers.length > 1) {
		return identifiers[identifiers.length - 1].text;
	}
	return null;
}

export function findClassDeclarations(node: Node): ClassDeclaration[] {
	const query = 'ClassDeclaration';
	return tsquery<ClassDeclaration>(node, query);
}

export function findClassPropertyByType(node: ClassDeclaration, type: string): string | null {
	return findClassPropertyConstructorParameterByType(node, type) || findClassPropertyDeclarationByType(node, type);
}

export function findConstructorDeclaration(node: ClassDeclaration): ConstructorDeclaration {
	const query = `Constructor`;
	const [result] = tsquery<ConstructorDeclaration>(node, query);
	return result;
}

export function findMethodParameterByType(node: Node, type: string): string | null {
	const query = `Parameter:has(TypeReference > Identifier[name="${type}"]) > Identifier`;
	const [result] = tsquery<Identifier>(node, query);
	if (result) {
		return result.text;
	}
	return null;
}

export function findMethodCallExpressions(node: Node, propName: string, fnName: string | string[]): CallExpression[] {
	if (Array.isArray(fnName)) {
		fnName = fnName.join('|');
	}
	const query = `CallExpression > PropertyAccessExpression:has(Identifier[name=/^(${fnName})$/]):has(PropertyAccessExpression:has(Identifier[name="${propName}"]):not(:has(ThisKeyword)))`;
	const nodes = tsquery<PropertyAccessExpression>(node, query).map((n) => n.parent as CallExpression);
	return nodes;
}

export function findClassPropertyConstructorParameterByType(node: ClassDeclaration, type: string): string | null {
	const query = `Constructor Parameter:has(TypeReference > Identifier[name="${type}"]):has(PublicKeyword,ProtectedKeyword,PrivateKeyword) > Identifier`;
	const [result] = tsquery<Identifier>(node, query);
	if (result) {
		return result.text;
	}
	return null;
}

export function findClassPropertyDeclarationByType(node: ClassDeclaration, type: string): string | null {
	const query = `PropertyDeclaration:has(TypeReference > Identifier[name="${type}"]) > Identifier`;
	const [result] = tsquery<Identifier>(node, query);
	if (result) {
		return result.text;
	}
	return null;
}

export function findFunctionCallExpressions(node: Node, fnName: string | string[]): CallExpression[] {
	if (Array.isArray(fnName)) {
		fnName = fnName.join('|');
	}
	const query = `CallExpression:has(Identifier[name="${fnName}"])`;
	const nodes = tsquery<CallExpression>(node, query);
	return nodes;
}

export function findPropertyCallExpressions(node: Node, prop: string, fnName: string | string[]): CallExpression[] {
	if (Array.isArray(fnName)) {
		fnName = fnName.join('|');
	}
	const query = `CallExpression > PropertyAccessExpression:has(Identifier[name=/^(${fnName})$/]):has(PropertyAccessExpression:has(Identifier[name="${prop}"]):has(ThisKeyword))`;
	const nodes = tsquery<PropertyAccessExpression>(node, query).map((n) => n.parent as CallExpression);
	return nodes;
}

export function findEnumDeclaration(node: SourceFile, enumIdentifier: string): EnumDeclaration | null {
	const queryWhereEnum = `ImportDeclaration:has(ImportSpecifier[text=${enumIdentifier}]) StringLiteral`;
	const [where] = tsquery<StringLiteral>(node, queryWhereEnum);
	const query = `EnumDeclaration:has(Identifier[name=${enumIdentifier}])`;
	if (!where) {
		const [result] = tsquery<EnumDeclaration>(node, query);
		return result;
	} else {
		const __dirname = process.cwd();
		const filePath = [where.text, __dirname + '/' + where.text, __dirname + '/' + where.text + '.ts'];
		for (var path of filePath) {
			const enumFile = glob.sync(path).filter((filePath) => fs.statSync(filePath).isFile())[0];
			if (enumFile) {
				const contents: string = fs.readFileSync(enumFile, 'utf-8');
				const [result] = tsquery<EnumDeclaration>(contents, query);
				return result;
			}
		}
		return null;
	}
}

export function getStringsFromExpression(expression: Expression, sourceFile: SourceFile): string[] {
	if (isStringLiteralLike(expression)) {
		return [expression.text];
	}

	if (isArrayLiteralExpression(expression)) {
		return expression.elements.reduce((result: string[], element: Expression) => {
			const strings = getStringsFromExpression(element, sourceFile);
			return [...result, ...strings];
		}, []);
	}

	if (isBinaryExpression(expression)) {
		const left = getStringsFromExpression(expression.left, sourceFile);
		const right = getStringsFromExpression(expression.right, sourceFile);

		if (left.length + right.length === 0) {
			return [];
		}

		if (expression.operatorToken.kind === SyntaxKind.BarBarToken) {
			if (left.length === 0) {
				return right;
			}
			if (right.length === 0) {
				return left;
			}
		}

		var results = [];
		for (var leftValue of left) {
			for (var rightValue of right) {
				if (expression.operatorToken.kind === SyntaxKind.PlusToken) {
					if (typeof leftValue === 'string' && typeof rightValue === 'string') {
						results.push(leftValue + rightValue);
					}
				} else if (expression.operatorToken.kind === SyntaxKind.BarBarToken) {
					if (typeof leftValue === 'string') {
						results.push(leftValue);
					}
					if (typeof rightValue === 'string') {
						results.push(rightValue);
					}
				}
			}
		}
		return results;
	}

	if (isConditionalExpression(expression)) {
		const [whenTrue] = getStringsFromExpression(expression.whenTrue, sourceFile);
		const [whenFalse] = getStringsFromExpression(expression.whenFalse, sourceFile);

		const result = [];
		if (typeof whenTrue === 'string') {
			result.push(whenTrue);
		}
		if (typeof whenFalse === 'string') {
			result.push(whenFalse);
		}
		return result;
	}

	if (isPropertyAccessExpression(expression)) {
		var enumMemberName: string;
		if (isIdentifier(expression.name) && expression.name.escapedText) {
			enumMemberName = expression.name.escapedText.toString();
		} else {
			return [];
		}

		if (isIdentifier(expression.expression)) {
			const enumObject = findEnumDeclaration(sourceFile, expression.expression.escapedText.toString());
			if (!enumObject) {
				return [];
			}
			for (var enumMember of enumObject.members) {
				if (isIdentifier(enumMember.name) && enumMember.name.escapedText && enumMember.name.escapedText.toString() === enumMemberName) {
					if (enumMember.initializer && isStringLiteralLike(enumMember.initializer)) {
						return [enumMember.initializer.text];
					}
				}
			}
			return [];
		}
	}
	if (isMemberName(expression)) {
		const [result] = tsquery<TypeReferenceNode>(sourceFile, `Parameter:has(Identifier[name=${expression.text}]) TypeReference`);
		if (!!result) {
			if (isIdentifier(result.typeName)) {
				const enumObject = findEnumDeclaration(sourceFile, result.typeName.escapedText.toString());
				if (!enumObject) {
					return [];
				}
				return enumObject.members.reduce((result: string[], member: EnumMember) => {
					if (member.initializer && isStringLiteralLike(member.initializer)) {
						return [...result, member.initializer.text];
					}
					return result;
				}, []);
			}
		}
	}
	return [];
}
