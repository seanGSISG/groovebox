export class AuthResponseDto {
  accessToken: string;
  user: {
    id: string;
    username: string;
    displayName: string;
  };
}
