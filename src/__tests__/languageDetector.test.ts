import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  getLanguageInfo,
  isFullySupportedLanguage,
  getSupportedExtensions,
  isExtensionSupported,
  type SupportedLanguage,
} from '../languageDetector.js';

describe('languageDetector', () => {
  describe('detectLanguage', () => {
    it('should detect JavaScript files', () => {
      const extensions = ['.js', '.mjs', '.cjs', '.jsx'];
      for (const ext of extensions) {
        const info = detectLanguage(`file${ext}`);
        expect(info.language).toBe('javascript');
        expect(info.supportsAST).toBe(true);
        expect(info.supportsBeautify).toBe(true);
        expect(info.supportsSourceMap).toBe(true);
      }
    });

    it('should detect TypeScript files', () => {
      const extensions = ['.ts', '.tsx', '.mts', '.cts'];
      for (const ext of extensions) {
        const info = detectLanguage(`file${ext}`);
        expect(info.language).toBe('typescript');
        expect(info.supportsAST).toBe(true);
        expect(info.supportsBeautify).toBe(true);
        expect(info.supportsSourceMap).toBe(true);
      }
    });

    it('should detect JSON files', () => {
      const info = detectLanguage('config.json');
      expect(info.language).toBe('json');
      expect(info.supportsAST).toBe(false);
      expect(info.supportsBeautify).toBe(true);
      expect(info.supportsSourceMap).toBe(false);
    });

    it('should detect HTML files', () => {
      for (const ext of ['.html', '.htm']) {
        const info = detectLanguage(`page${ext}`);
        expect(info.language).toBe('html');
        expect(info.supportsBeautify).toBe(true);
      }
    });

    it('should detect XML files', () => {
      for (const ext of ['.xml', '.svg']) {
        const info = detectLanguage(`file${ext}`);
        expect(info.language).toBe('xml');
        expect(info.supportsBeautify).toBe(true);
      }
    });

    it('should detect CSS files', () => {
      const info = detectLanguage('styles.css');
      expect(info.language).toBe('css');
      expect(info.supportsBeautify).toBe(true);
    });

    it('should return unknown for unsupported extensions', () => {
      const unknownFiles = ['readme.md', 'data.txt', 'image.png', 'script.py'];
      for (const file of unknownFiles) {
        const info = detectLanguage(file);
        expect(info.language).toBe('unknown');
        expect(info.supportsAST).toBe(false);
        expect(info.supportsBeautify).toBe(false);
        expect(info.supportsSourceMap).toBe(false);
      }
    });

    it('should handle paths with directories', () => {
      const info = detectLanguage('/path/to/src/app.ts');
      expect(info.language).toBe('typescript');
    });

    it('should be case-insensitive for extensions', () => {
      const info = detectLanguage('file.JS');
      expect(info.language).toBe('javascript');
    });
  });

  describe('getLanguageInfo', () => {
    it('should return correct info for each language', () => {
      const languages: SupportedLanguage[] = [
        'javascript', 'typescript', 'json', 'html', 'xml', 'css', 'unknown'
      ];
      
      for (const lang of languages) {
        const info = getLanguageInfo(lang);
        expect(info.language).toBe(lang);
      }
    });

    it('should return full support for JS/TS', () => {
      const jsInfo = getLanguageInfo('javascript');
      const tsInfo = getLanguageInfo('typescript');
      
      expect(jsInfo.supportsAST).toBe(true);
      expect(jsInfo.supportsBeautify).toBe(true);
      expect(jsInfo.supportsSourceMap).toBe(true);
      
      expect(tsInfo.supportsAST).toBe(true);
      expect(tsInfo.supportsBeautify).toBe(true);
      expect(tsInfo.supportsSourceMap).toBe(true);
    });
  });

  describe('isFullySupportedLanguage', () => {
    it('should return true for JS and TS', () => {
      expect(isFullySupportedLanguage('javascript')).toBe(true);
      expect(isFullySupportedLanguage('typescript')).toBe(true);
    });

    it('should return false for other languages', () => {
      expect(isFullySupportedLanguage('json')).toBe(false);
      expect(isFullySupportedLanguage('html')).toBe(false);
      expect(isFullySupportedLanguage('xml')).toBe(false);
      expect(isFullySupportedLanguage('css')).toBe(false);
      expect(isFullySupportedLanguage('unknown')).toBe(false);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all supported extensions', () => {
      const extensions = getSupportedExtensions();
      expect(extensions).toContain('.js');
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.json');
      expect(extensions).toContain('.html');
      expect(extensions).toContain('.css');
    });
  });

  describe('isExtensionSupported', () => {
    it('should return true for supported extensions', () => {
      expect(isExtensionSupported('.js')).toBe(true);
      expect(isExtensionSupported('js')).toBe(true);
      expect(isExtensionSupported('.ts')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(isExtensionSupported('.md')).toBe(false);
      expect(isExtensionSupported('.py')).toBe(false);
    });
  });
});
