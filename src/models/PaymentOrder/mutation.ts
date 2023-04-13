import { builder } from "../../builder";
import Razorpay from "razorpay";
import { v4 as uuidv4 } from "uuid";

enum OrderTypeEnum {
  FEST_REGISTRATION = "FEST_REGISTRATION",
  EVENT_REGISTRATION = "EVENT_REGISTRATION",
}

const OrderType = builder.enumType(OrderTypeEnum, {
  name: "OrderType",
});

builder.mutationField("createPaymentOrder", (t) =>
  t.prismaField({
    type: "PaymentOrder",
    args: {
      type: t.arg({
        type: OrderType,
        required: true,
      }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) {
        throw new Error("Not authenticated");
      }
      if (
        user.role == "ORGANIZER" ||
        user.role == "PARTICIPANT" ||
        user.role == "BRANCH_REP"
      ) {
        throw new Error("Already Registered");
      }

      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY as string,
        key_secret: process.env.RAZORPAY_SECRET as string,
      });
      if (args.type === OrderTypeEnum.EVENT_REGISTRATION) {
        // EVENT_REGISTRATION
        throw new Error("Not implemented");
      }
      // FEST_REGISTRATION
      //check if user already has a pending order for FEST_REGISTRATION
      if (user.role !== "USER") {
        throw new Error("Already Registered");
      }
      const existingOrder = await ctx.prisma.paymentOrder.findFirst({
        where: {
          User: {
            id: user.id,
          },
          type: args.type,
          status: "PENDING",
        },
      });
      if (existingOrder) {
        await ctx.prisma.paymentOrder.delete({
          where: {
            id: existingOrder.id,
          },
        });
      }
      let amount = 300;
      if (user.email.endsWith("nmamit.in")) {
        amount = 200;
      } else {
        const userData = await ctx.prisma.user.findUnique({
          where: {
            id: user.id,
          },
          include: {
            College: true,
          },
        });
        if (userData?.College?.type === "OTHER") {
          amount = 150;
        }
      }

      const payment_capture = 1;

      const currency = "INR";
      const options = {
        amount: (Math.ceil(amount / 0.98) * 100).toString(),
        currency,
        payment_capture,
      };
      const response = await razorpay.orders.create(options);
      return ctx.prisma.paymentOrder.create({
        ...query,
        data: {
          amount: Number(response.amount),
          status: "PENDING",
          type: args.type,
          User: {
            connect: {
              id: user.id,
            },
          },
          orderId: response.id as string,
        },
      });
    },
  })
);

builder.mutationField("eventPaymentOrder", (t) =>
  t.prismaField({
    type: "EventPaymentOrder",
    args: {
      teamId: t.arg({
        type: "ID",
        required: true,
      }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) {
        throw new Error("Not authenticated");
      }
      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
        include: {
          Event: true,
          TeamMembers: true,
        },
      });
      if (!team) {
        throw new Error("Team not found");
      }
      if (team.Event.fees === 0) {
        throw new Error("Event is free");
      }
      if (
        team.Event.minTeamSize &&
        team.TeamMembers.length < team.Event.minTeamSize
      ) {
        throw new Error(
          `Still need ${team.Event.minTeamSize} members to register`
        );
      }
      if (
        team.Event.maxTeamSize &&
        team.TeamMembers.length > team.Event.maxTeamSize
      ) {
        throw new Error(
          `Team size exceeded. Max team size is ${team.Event.maxTeamSize}`
        );
      }

      if (team.confirmed) {
        throw new Error("Already confirmed");
      }
      if (user.id != team.leaderId) {
        throw new Error("Oops! You are Not the leader");
      }
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY as string,
        key_secret: process.env.RAZORPAY_SECRET as string,
      });

      const payment_capture = 1;
      const amount = Math.ceil(team.Event.fees / 0.98);
      const currency = "INR";
      const options = {
        amount: (amount * 100).toString(),
        currency,
        payment_capture,
      };
      const response = await razorpay.orders.create(options);
      return ctx.prisma.eventPaymentOrder.create({
        ...query,
        data: {
          amount: Number(response.amount),
          status: "PENDING",
          Team: {
            connect: {
              id: team.id,
            },
          },
          orderId: response.id as string,
        },
      });
    },
  })
);
