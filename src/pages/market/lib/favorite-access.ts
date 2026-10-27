/** A valid PD2 identity whose OAuth login cannot use the website's favorites service. */
export class FavoriteAccessError extends Error {
  constructor(public readonly userId: string) {
    super('当前登录有效，但官网未向此登录开放收藏接口。');
    this.name = 'FavoriteAccessError';
  }
}
