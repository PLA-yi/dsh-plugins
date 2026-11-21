const ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
};
export function htmlText(html) {
    return html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (entity, name)=>{
        if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
        if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
        return ENTITIES[name.toLowerCase()] ?? entity;
    }).replace(/[ \t\f\v]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim();
}
