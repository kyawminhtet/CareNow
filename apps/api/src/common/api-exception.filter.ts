import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionBody = exception instanceof HttpException ? exception.getResponse() : undefined;
    const code = typeof exceptionBody === "object" && exceptionBody !== null && "code" in exceptionBody
      ? String(exceptionBody.code)
      : status >= 500
        ? "INTERNAL_ERROR"
        : "REQUEST_FAILED";

    reply.status(status).send({
      code,
      requestId: request.id,
    });
  }
}
