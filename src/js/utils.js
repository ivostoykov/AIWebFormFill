export function isLocalOrSecureEndpoint(urlString){
    try {
        const url = new URL(urlString);
        const hostname = url.hostname.toLowerCase();

        const isLocalhost = hostname === 'localhost' ||
                          hostname === '127.0.0.1' ||
                          hostname === '::1' ||
                          hostname === '[::1]' ||
                          hostname.startsWith('192.168.') ||
                          hostname.startsWith('10.') ||
                          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

        const isSecure = url.protocol === 'https:';

        return { isLocal: isLocalhost, isSecure, hostname, protocol: url.protocol };
    } catch (e) {
        return { isLocal: false, isSecure: false, hostname: '', protocol: '' };
    }
}

export function cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
        return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        if (!vecA[i] || !vecB[i]) { break; }
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function isOldFormat(data) {
    return Object.values(data).some(v => !Array.isArray(v));
}

export function convertToNewFormat(oldData) {
    const newData = {};
    for (const [field, value] of Object.entries(oldData)) {
        if (Array.isArray(value)) { continue; }

        if (!newData[value]) {
            newData[value] = new Set();
        }
        newData[value].add(field);
    }

    for (const key in newData) {
        newData[key] = Array.from(newData[key]);
    }

    return newData;
}
