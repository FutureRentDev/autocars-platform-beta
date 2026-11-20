import ts from "typescript";

// Fragments preserve their parent's text context: {" "} inside a fragment is
// still a native text node when that fragment is rendered in a View.
export function nativeTextViolations(source, filename = "App.tsx") {
  const tree = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const textContainers = new Set(["Text", "Button", "CheckBox", "Empty"]);
  const violations = [];
  function visit(node, textContext = false) {
    if (ts.isJsxElement(node)) {
      const text = textContainers.has(
        node.openingElement.tagName.getText(tree),
      );
      node.children.forEach((child) => visit(child, text));
      return;
    }
    if (ts.isJsxFragment(node)) {
      node.children.forEach((child) => visit(child, textContext));
      return;
    }
    if (ts.isJsxSelfClosingElement(node)) return;
    const literal = ts.isJsxText(node)
      ? node.text.trim()
      : ts.isJsxExpression(node) &&
          node.expression &&
          (ts.isStringLiteral(node.expression) ||
            ts.isNumericLiteral(node.expression))
        ? node.expression.text
        : null;
    if (!textContext && literal !== null && literal !== "") {
      violations.push(
        tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
      );
    }
    ts.forEachChild(node, (child) => visit(child, textContext));
  }
  visit(tree);
  return violations;
}
